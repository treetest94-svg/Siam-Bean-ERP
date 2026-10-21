-- Isolated application schema. No direct client access to tables.
create schema if not exists siam_erp;
revoke all on schema siam_erp from public, anon, authenticated;
create extension if not exists pgcrypto with schema extensions;
create table siam_erp.users(id bigint generated always as identity primary key, username text unique not null, password_hash text not null, role text not null check(role in ('admin','sales','warehouse','accountant')), active boolean not null default true);
create table siam_erp.sessions(token_hash text primary key,user_id bigint not null references siam_erp.users,expires_at timestamptz not null default now()+interval '8 hours');
create table siam_erp.products(id bigint generated always as identity primary key,sku text unique not null check(length(trim(sku)) between 1 and 40),name text not null check(length(trim(name)) between 1 and 120),unit text not null default 'kg',price numeric(12,2) not null check(price>=0),cost numeric(12,2) not null default 0 check(cost>=0),stock numeric(12,3) not null default 0 check(stock>=0),reorder_level numeric(12,3) not null default 20 check(reorder_level>=0),active boolean not null default true);
create table siam_erp.customers(id bigint generated always as identity primary key,name text not null check(length(trim(name)) between 1 and 120),email text not null check(email ~ '^[^@ ]+@[^@ ]+\.[^@ ]+$'),address text not null check(length(trim(address)) between 1 and 300),tax_id text not null check(tax_id ~ '^[0-9]{13}$'),payment_terms integer not null default 0 check(payment_terms between 0 and 365),active boolean not null default true);
create table siam_erp.orders(id bigint generated always as identity primary key,customer_id bigint not null references siam_erp.customers,status text not null default 'draft' check(status in ('draft','confirmed')),created_by bigint not null references siam_erp.users,created_at timestamptz not null default now());
create table siam_erp.order_lines(id bigint generated always as identity primary key,order_id bigint not null references siam_erp.orders,product_id bigint not null references siam_erp.products,sku text not null,name text not null,quantity numeric(12,3) not null check(quantity>0),unit_price numeric(12,2) not null check(unit_price>=0),unique(order_id,product_id));
create table siam_erp.invoices(id bigint generated always as identity primary key,order_id bigint unique not null references siam_erp.orders,customer_name text not null,customer_address text not null,customer_tax_id text not null,due_date date not null,subtotal numeric(12,2) not null,vat numeric(12,2) not null,total numeric(12,2) not null,status text not null default 'unpaid' check(status in ('unpaid','paid')),created_at timestamptz not null default now());
create table siam_erp.payments(id bigint generated always as identity primary key,invoice_id bigint unique not null references siam_erp.invoices,amount numeric(12,2) not null check(amount>=0),method text not null check(method in ('bank_transfer','cash')),reference text not null default '',created_by bigint not null references siam_erp.users,created_at timestamptz not null default now());
create table siam_erp.stock_movements(id bigint generated always as identity primary key,product_id bigint not null references siam_erp.products,quantity numeric(12,3) not null check(quantity<>0),reason text not null,order_id bigint references siam_erp.orders,created_by bigint references siam_erp.users,created_at timestamptz not null default now());
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
 when p_action in ('payment_create','accounting') then array['admin','accountant']
 when p_action in ('state','health') then array['admin','sales','warehouse','accountant']
 else array[]::text[] end;
 if not (u.role=any(allowed)) then return jsonb_build_object('error','Your role cannot perform this action','status',403); end if;
 if p_action='health' then return '{"database":"connected"}'::jsonb; end if;
 if p_action='accounting' then return jsonb_build_object('payments',(select coalesce(jsonb_agg(to_jsonb(pay)),'[]') from siam_erp.payments pay)); end if;
 if p_action='state' then
   return jsonb_build_object(
    'products',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from siam_erp.products p),
    'customers',case when u.role='warehouse' then '[]'::jsonb else (select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]') from siam_erp.customers c) end,
    'orders',case when u.role='warehouse' then '[]'::jsonb else (select coalesce(jsonb_agg(to_jsonb(z) order by z.id desc),'[]') from (select ord.*,c.name customer_name,(select coalesce(jsonb_agg(to_jsonb(l) order by l.id),'[]') from siam_erp.order_lines l where l.order_id=ord.id) lines from siam_erp.orders ord join siam_erp.customers c on c.id=ord.customer_id) z) end,
    'invoices',case when u.role='warehouse' then '[]'::jsonb else (select coalesce(jsonb_agg(to_jsonb(z) order by z.id desc),'[]') from (select i.*,'INV-'||lpad(i.id::text,4,'0') number,(select coalesce(jsonb_agg(to_jsonb(l) order by l.id),'[]') from siam_erp.order_lines l where l.order_id=i.order_id) lines from siam_erp.invoices i) z) end,
    'payments',case when u.role in ('admin','accountant') then (select coalesce(jsonb_agg(to_jsonb(p) order by p.id desc),'[]') from siam_erp.payments p) else '[]'::jsonb end,
    'movements',(select coalesce(jsonb_agg(to_jsonb(z) order by z.id desc),'[]') from (select m.*,p.sku from siam_erp.stock_movements m join siam_erp.products p on p.id=m.product_id order by m.id desc limit 100) z),
    'metrics',jsonb_build_object('sales_today',(select coalesce(sum(total),0) from siam_erp.invoices where (created_at at time zone 'Asia/Bangkok')::date=(now() at time zone 'Asia/Bangkok')::date),'low_stock',(select count(*) from siam_erp.products where active and stock<=reorder_level),'open_invoices',(select count(*) from siam_erp.invoices where status='unpaid'),'receivables',(select coalesce(sum(total),0) from siam_erp.invoices where status='unpaid'),'collected',(select coalesce(sum(pay.amount),0) from siam_erp.payments pay)));
 elsif p_action='product_save' then
   if p_data ? 'id' then
    update siam_erp.products set sku=upper(trim(p_data->>'sku')),name=trim(p_data->>'name'),unit=trim(p_data->>'unit'),price=(p_data->>'price')::numeric,cost=coalesce((p_data->>'cost')::numeric,0),reorder_level=(p_data->>'reorder_level')::numeric where id=(p_data->>'id')::bigint returning id into pid;
   else
    insert into siam_erp.products(sku,name,unit,price,cost,reorder_level) values(upper(trim(p_data->>'sku')),trim(p_data->>'name'),coalesce(nullif(trim(p_data->>'unit'),''),'kg'),(p_data->>'price')::numeric,coalesce((p_data->>'cost')::numeric,0),(p_data->>'reorder_level')::numeric) returning id into pid;
   end if;
   if pid is null then return '{"error":"Product not found","status":404}'; end if;
   return jsonb_build_object('id',pid);
 elsif p_action='product_active' then update siam_erp.products set active=(p_data->>'active')::boolean where id=(p_data->>'id')::bigint returning id into pid; if pid is null then return '{"error":"Product not found","status":404}'; end if;
 elsif p_action='customer_save' then
   if p_data ? 'id' then update siam_erp.customers set name=trim(p_data->>'name'),email=trim(p_data->>'email'),address=trim(p_data->>'address'),tax_id=trim(p_data->>'tax_id'),payment_terms=coalesce((p_data->>'payment_terms')::integer,0) where id=(p_data->>'id')::bigint returning id into cid;
   else insert into siam_erp.customers(name,email,address,tax_id,payment_terms) values(trim(p_data->>'name'),trim(p_data->>'email'),trim(p_data->>'address'),trim(p_data->>'tax_id'),coalesce((p_data->>'payment_terms')::integer,0)) returning id into cid; end if;
   if cid is null then return '{"error":"Customer not found","status":404}'; end if;
   return jsonb_build_object('id',cid);
 elsif p_action='customer_active' then update siam_erp.customers set active=(p_data->>'active')::boolean where id=(p_data->>'id')::bigint returning id into cid; if cid is null then return '{"error":"Customer not found","status":404}'; end if;
 elsif p_action='stock_in' then
   q:=(p_data->>'quantity')::numeric;
   if q is null or q<=0 or q>100000 or length(trim(coalesce(p_data->>'reason','')))=0 then return '{"error":"Enter a positive quantity and a stock-in reason","status":422}'; end if;
   select id into pid from siam_erp.products where id=(p_data->>'product_id')::bigint and active for update;
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
   select p.* into prod from siam_erp.products p join siam_erp.order_lines l on p.id=l.product_id where l.order_id=o.id and (p.stock<l.quantity or not p.active) order by p.id limit 1;
   if prod.id is not null then return jsonb_build_object('error','Not enough stock for '||prod.sku||' (or product is inactive). Nothing was changed.','status',409); end if;
   if not exists(select 1 from siam_erp.customers where id=o.customer_id and active) then return '{"error":"Customer is inactive","status":409}'; end if;
   select round(sum(quantity*unit_price),2) into subtotal from siam_erp.order_lines where order_id=o.id;
   insert into siam_erp.stock_movements(product_id,quantity,reason,order_id,created_by) select product_id,-quantity,'Confirmed sales order',o.id,u.id from siam_erp.order_lines where order_id=o.id;
   insert into siam_erp.invoices(order_id,customer_name,customer_address,customer_tax_id,due_date,subtotal,vat,total) select o.id,c.name,c.address,c.tax_id,(now() at time zone 'Asia/Bangkok')::date+c.payment_terms,subtotal,round(subtotal*0.07,2),subtotal+round(subtotal*0.07,2) from siam_erp.customers c where c.id=o.customer_id returning * into inv;
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
create function siam_erp.apply_stock_movement() returns trigger language plpgsql set search_path=siam_erp,pg_temp as $$ begin update siam_erp.products set stock=stock+NEW.quantity where id=NEW.product_id; return NEW; end $$;
create trigger stock_movement_balance after insert on siam_erp.stock_movements for each row execute function siam_erp.apply_stock_movement();
insert into siam_erp.products(sku,name,unit,cost,price,stock,reorder_level) values ('ARB-1KG','Arabica, 1 kg bag','kg',320,450,0,50),('ROB-1KG','Robusta, 1 kg bag','kg',220,320,0,40),('BLD-1KG','House Blend, 1 kg bag','kg',260,380,0,30),('DRP-10','Drip bags, box of 10','box',90,150,0,100);
insert into siam_erp.stock_movements(product_id,quantity,reason) select id,case sku when 'ARB-1KG' then 170 when 'ROB-1KG' then 35 when 'BLD-1KG' then 90 else 240 end,'Opening stock' from siam_erp.products;
insert into siam_erp.customers(name,email,address,tax_id,payment_terms) values ('Café Lune','orders@cafelune.example','Bangkok — classroom sample','0105561000011',30),('Brew Lab Ari','orders@brewlab.example','Bangkok — classroom sample','0105562000022',0),('Sukhumvit Corner Café','orders@sukhumvitcorner.example','Bangkok — classroom sample','0105563000033',15);
