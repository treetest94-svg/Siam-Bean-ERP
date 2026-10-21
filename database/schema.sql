-- Isolated application schema. No direct client access to tables.
create schema if not exists siam_erp;
revoke all on schema siam_erp from public, anon, authenticated;
create extension if not exists pgcrypto with schema extensions;
create table siam_erp.users(id bigint generated always as identity primary key, username text unique not null, password_hash text not null, role text not null check(role in ('admin','sales','warehouse','accountant')), active boolean not null default true);
create table siam_erp.sessions(token_hash text primary key,user_id bigint not null references siam_erp.users,expires_at timestamptz not null default now()+interval '8 hours');
create table siam_erp.products(id bigint generated always as identity primary key,sku text unique not null check(length(trim(sku)) between 1 and 40),name text not null check(length(trim(name)) between 1 and 120),unit text not null default 'kg',price numeric(12,2) not null check(price>0),stock numeric(12,3) not null default 0 check(stock>=0),reorder_level numeric(12,3) not null default 20 check(reorder_level>=0),active boolean not null default true);
create table siam_erp.customers(id bigint generated always as identity primary key,name text not null check(length(trim(name)) between 1 and 120),email text not null check(email ~ '^[^@ ]+@[^@ ]+\.[^@ ]+$'),address text not null check(length(trim(address)) between 1 and 300),active boolean not null default true);
create table siam_erp.orders(id bigint generated always as identity primary key,customer_id bigint not null references siam_erp.customers,status text not null default 'draft' check(status in ('draft','confirmed')),created_by bigint not null references siam_erp.users,created_at timestamptz not null default now());
create table siam_erp.order_lines(id bigint generated always as identity primary key,order_id bigint not null references siam_erp.orders,product_id bigint not null references siam_erp.products,sku text not null,name text not null,quantity numeric(12,3) not null check(quantity>0),unit_price numeric(12,2) not null check(unit_price>0),unique(order_id,product_id));
create table siam_erp.invoices(id bigint generated always as identity primary key,order_id bigint unique not null references siam_erp.orders,customer_name text not null,customer_address text not null,subtotal numeric(12,2) not null,vat numeric(12,2) not null,total numeric(12,2) not null,status text not null default 'unpaid' check(status in ('unpaid','paid')),created_at timestamptz not null default now());
create table siam_erp.payments(id bigint generated always as identity primary key,invoice_id bigint unique not null references siam_erp.invoices,amount numeric(12,2) not null check(amount>0),method text not null check(method in ('bank_transfer','cash')),reference text not null default '',created_by bigint not null references siam_erp.users,created_at timestamptz not null default now());
create table siam_erp.stock_movements(id bigint generated always as identity primary key,product_id bigint not null references siam_erp.products,quantity numeric(12,3) not null check(quantity<>0),reason text not null,order_id bigint references siam_erp.orders,created_by bigint not null references siam_erp.users,created_at timestamptz not null default now());
create index on siam_erp.sessions(user_id);
create index on siam_erp.orders(customer_id);
create index on siam_erp.order_lines(product_id);
create index on siam_erp.stock_movements(product_id);
-- All writes and reads pass through one authenticated, role-enforcing transaction.
create function public.siam_erp_api(p_action text,p_token text default '',p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path = siam_erp, pg_temp as $$
declare u siam_erp.users%rowtype; r jsonb; tok text; x jsonb; o siam_erp.orders%rowtype; inv siam_erp.invoices%rowtype; prod siam_erp.products%rowtype; cid bigint; oid bigint; pid bigint; amount numeric; subtotal numeric; q numeric; allowed text[];
begin
 if p_action='login' then
   select * into u from siam_erp.users where username=lower(trim(p_data->>'username')) and active;
   if u.id is null or u.password_hash <> extensions.crypt(coalesce(p_data->>'password',''),u.password_hash) then return jsonb_build_object('error','Invalid username or password','status',401); end if;
   tok:=encode(extensions.gen_random_bytes(32),'hex');
   insert into siam_erp.sessions(token_hash,user_id) values(encode(sha256(convert_to(tok,'UTF8')),'hex'),u.id);
   return jsonb_build_object('token',tok,'user',jsonb_build_object('username',u.username,'role',u.role));
 end if;
 select a.* into u from siam_erp.users a join siam_erp.sessions s on s.user_id=a.id where s.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and s.expires_at>now() and a.active;
 if u.id is null then return jsonb_build_object('error','Please sign in','status',401); end if;
 if p_action='logout' then delete from siam_erp.sessions where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex'); return '{}'::jsonb; end if;
 if p_action='me' then return jsonb_build_object('username',u.username,'role',u.role); end if;
 allowed:=case
 when p_action in ('product_save','product_active') then array['admin']
 when p_action in ('customer_save','customer_active','order_create','order_confirm') then array['admin','sales']
 when p_action='stock_in' then array['admin','warehouse']
 when p_action='payment_create' then array['admin','accountant']
 when p_action in ('state','health') then array['admin','sales','warehouse','accountant']
 else array[]::text[] end;
 if not (u.role=any(allowed)) then return jsonb_build_object('error','Your role cannot perform this action','status',403); end if;
 if p_action='health' then return '{"database":"connected"}'::jsonb; end if;
 if p_action='state' then
   return jsonb_build_object(
    'products',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from siam_erp.products p),
    'customers',(select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]') from siam_erp.customers c),
    'orders',(select coalesce(jsonb_agg(to_jsonb(z) order by z.id desc),'[]') from (select ord.*,c.name customer_name,(select coalesce(jsonb_agg(to_jsonb(l) order by l.id),'[]') from siam_erp.order_lines l where l.order_id=ord.id) lines from siam_erp.orders ord join siam_erp.customers c on c.id=ord.customer_id) z),
    'invoices',(select coalesce(jsonb_agg(to_jsonb(z) order by z.id desc),'[]') from (select i.*,'INV-'||lpad(i.id::text,4,'0') number,(select coalesce(jsonb_agg(to_jsonb(l) order by l.id),'[]') from siam_erp.order_lines l where l.order_id=i.order_id) lines from siam_erp.invoices i) z),
    'payments',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id desc),'[]') from siam_erp.payments p),
    'movements',(select coalesce(jsonb_agg(to_jsonb(z) order by z.id desc),'[]') from (select m.*,p.sku from siam_erp.stock_movements m join siam_erp.products p on p.id=m.product_id order by m.id desc limit 100) z),
    'metrics',jsonb_build_object('sales_today',(select coalesce(sum(total),0) from siam_erp.invoices where (created_at at time zone 'Asia/Bangkok')::date=(now() at time zone 'Asia/Bangkok')::date),'low_stock',(select count(*) from siam_erp.products where active and stock<=reorder_level),'open_invoices',(select count(*) from siam_erp.invoices where status='unpaid'),'receivables',(select coalesce(sum(total),0) from siam_erp.invoices where status='unpaid'),'collected',(select coalesce(sum(amount),0) from siam_erp.payments)));
 elsif p_action='product_save' then
   if p_data ? 'id' then
    update siam_erp.products set sku=upper(trim(p_data->>'sku')),name=trim(p_data->>'name'),unit=trim(p_data->>'unit'),price=(p_data->>'price')::numeric,reorder_level=(p_data->>'reorder_level')::numeric where id=(p_data->>'id')::bigint returning id into pid;
   else
    insert into siam_erp.products(sku,name,unit,price,reorder_level) values(upper(trim(p_data->>'sku')),trim(p_data->>'name'),coalesce(nullif(trim(p_data->>'unit'),''),'kg'),(p_data->>'price')::numeric,(p_data->>'reorder_level')::numeric) returning id into pid;
   end if;
   if pid is null then return '{"error":"Product not found","status":404}'; end if;
   return jsonb_build_object('id',pid);
 elsif p_action='product_active' then update siam_erp.products set active=(p_data->>'active')::boolean where id=(p_data->>'id')::bigint returning id into pid; if pid is null then return '{"error":"Product not found","status":404}'; end if;
 elsif p_action='customer_save' then
   if p_data ? 'id' then update siam_erp.customers set name=trim(p_data->>'name'),email=trim(p_data->>'email'),address=trim(p_data->>'address') where id=(p_data->>'id')::bigint returning id into cid;
   else insert into siam_erp.customers(name,email,address) values(trim(p_data->>'name'),trim(p_data->>'email'),trim(p_data->>'address')) returning id into cid; end if;
   if cid is null then return '{"error":"Customer not found","status":404}'; end if;
   return jsonb_build_object('id',cid);
 elsif p_action='customer_active' then update siam_erp.customers set active=(p_data->>'active')::boolean where id=(p_data->>'id')::bigint returning id into cid; if cid is null then return '{"error":"Customer not found","status":404}'; end if;
 elsif p_action='stock_in' then
   q:=(p_data->>'quantity')::numeric;
   if q is null or q<=0 or q>100000 or length(trim(coalesce(p_data->>'reason','')))=0 then return '{"error":"Enter a positive quantity and a stock-in reason","status":422}'; end if;
   update siam_erp.products set stock=stock+q where id=(p_data->>'product_id')::bigint and active returning id into pid;
   if pid is null then return '{"error":"Active product not found","status":404}'; end if;
   insert into siam_erp.stock_movements(product_id,quantity,reason,created_by) values(pid,q,left(p_data->>'reason',200),u.id);
 elsif p_action='order_create' then
   select id into cid from siam_erp.customers where id=(p_data->>'customer_id')::bigint and active;
   if cid is null then return '{"error":"Choose an active customer","status":422}'; end if;
   if jsonb_typeof(p_data->'lines') is distinct from 'array' or jsonb_array_length(p_data->'lines') not between 1 and 50 then return '{"error":"Add between 1 and 50 order lines","status":422}'; end if;
   insert into siam_erp.orders(customer_id,created_by) values(cid,u.id) returning id into oid;
   for x in select * from jsonb_array_elements(p_data->'lines') loop
     select * into prod from siam_erp.products where id=(x->>'product_id')::bigint and active;
     q:=(x->>'quantity')::numeric;
     if prod.id is null or q is null or q<=0 or q>100000 then raise exception using errcode='22023',message='Use active products and positive quantities'; end if;
     insert into siam_erp.order_lines(order_id,product_id,sku,name,quantity,unit_price) values(oid,prod.id,prod.sku,prod.name,q,prod.price);
   end loop;
   return jsonb_build_object('id',oid);
 elsif p_action='order_confirm' then
   select * into o from siam_erp.orders where id=(p_data->>'id')::bigint for update;
   if o.id is null then return '{"error":"Order not found","status":404}'; end if;
   if o.status='confirmed' then return jsonb_build_object('id',o.id,'already_confirmed',true); end if;
   -- Lock products in stable ID order; concurrent orders cannot oversell.
   perform p.id from siam_erp.products p join siam_erp.order_lines l on p.id=l.product_id where l.order_id=o.id order by p.id for update of p;
   if exists(select 1 from siam_erp.products p join siam_erp.order_lines l on p.id=l.product_id where l.order_id=o.id and (p.stock<l.quantity or not p.active)) then return '{"error":"Insufficient stock or inactive product. Nothing was changed.","status":409}'; end if;
   if not exists(select 1 from siam_erp.customers where id=o.customer_id and active) then return '{"error":"Customer is inactive","status":409}'; end if;
   select round(sum(quantity*unit_price),2) into subtotal from siam_erp.order_lines where order_id=o.id;
   update siam_erp.products p set stock=p.stock-l.quantity from siam_erp.order_lines l where l.product_id=p.id and l.order_id=o.id;
   insert into siam_erp.stock_movements(product_id,quantity,reason,order_id,created_by) select product_id,-quantity,'Confirmed sales order',o.id,u.id from siam_erp.order_lines where order_id=o.id;
   insert into siam_erp.invoices(order_id,customer_name,customer_address,subtotal,vat,total) select o.id,c.name,c.address,subtotal,round(subtotal*0.07,2),subtotal+round(subtotal*0.07,2) from siam_erp.customers c where c.id=o.customer_id returning * into inv;
   update siam_erp.orders set status='confirmed' where id=o.id;
   return jsonb_build_object('id',o.id,'invoice_id',inv.id,'total',inv.total);
 elsif p_action='payment_create' then
   select * into inv from siam_erp.invoices where id=(p_data->>'invoice_id')::bigint for update;
   if inv.id is null then return '{"error":"Invoice not found","status":404}'; end if;
   if inv.status='paid' then return '{"error":"This invoice is already paid","status":409}'; end if;
   amount:=(p_data->>'amount')::numeric;
   if amount is null or amount<>inv.total then return '{"error":"Payment must equal the full invoice total","status":422}'; end if;
   insert into siam_erp.payments(invoice_id,amount,method,reference,created_by) values(inv.id,amount,p_data->>'method',left(coalesce(p_data->>'reference',''),120),u.id);
   update siam_erp.invoices set status='paid' where id=inv.id;
 end if;
 return '{"ok":true}'::jsonb;
exception when unique_violation then return '{"error":"Duplicate SKU, product line, or payment","status":409}'::jsonb;
when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then return '{"error":"Check required fields, positive values, and valid formats","status":422}'::jsonb;
when foreign_key_violation then return '{"error":"Referenced record does not exist","status":422}'::jsonb;
end $$;
revoke all on function public.siam_erp_api(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.siam_erp_api(text,text,jsonb) to anon;
-- Table-level access is denied even with a publishable API key.
do $$ declare t record; begin for t in select tablename from pg_tables where schemaname='siam_erp' loop execute format('alter table siam_erp.%I enable row level security',t.tablename); execute format('revoke all on siam_erp.%I from public,anon,authenticated',t.tablename); end loop; end $$;
insert into siam_erp.products(sku,name,unit,price,stock,reorder_level) values ('ARB-1KG','Arabica House Blend','kg',450,170,30),('ROB-1KG','Robusta Espresso','kg',280,85,20),('DEC-500G','Decaf Mountain Roast','bag',320,12,15),('DRIP-10','Signature Drip Bags','box',240,42,10);
insert into siam_erp.customers(name,email,address) values ('Café Lune','orders@cafelune.example','Bangkok, Thailand — classroom sample'),('Morning Ritual','hello@morningritual.example','Chiang Mai, Thailand — classroom sample'),('The Little Roastery','orders@littleroastery.example','Nonthaburi, Thailand — classroom sample');
