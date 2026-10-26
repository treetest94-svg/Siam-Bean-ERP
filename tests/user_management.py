"""Targeted real-API checks. Credentials stay in a private external JSON file."""
import json, os, secrets, uuid
from pathlib import Path
import httpx
base=os.environ.get('ERP_BASE_URL','https://siam-bean-erp-kohl.vercel.app')
credentials=json.loads(Path(os.environ['ERP_TEST_CREDENTIALS']).read_text())
checks=0
clients={role:httpx.Client(base_url=base,timeout=60) for role in credentials}
def check(condition,label):
 global checks
 assert condition,label
 checks+=1
 print('PASS',label,flush=True)
def call(role,action,data=None):return clients[role].post('/api/'+action,json=data or {})
for role,password in credentials.items():check(call(role,'login',{'username':role,'password':password}).status_code==200,role+' login')
users=call('admin','user_list');check(users.status_code==200,'Admin can list users')
rows=users.json()['users'];check(all(set(r)=={'id','username','role','active'} for r in rows),'No password hashes or tokens in user list')
admin=next(r for r in rows if r['username']=='admin')
check(call('admin','user_delete',{'id':admin['id']}).status_code==409,'Admin cannot delete self or last Admin')
for role in ['sales','warehouse','accountant']:
 for action in ['user_list','user_create','user_delete']:check(call(role,action).status_code==403,role+' blocked from '+action)
 check(call(role,'state').json()['users']==[],role+' cannot see user directory')
check(call('admin','user_create',{'username':'bad name','password':secrets.token_urlsafe(18),'role':'sales'}).status_code==422,'Invalid username rejected')
check(call('admin','user_create',{'username':'qa_invalid','password':'short','role':'sales'}).status_code==422,'Short password rejected')
check(call('admin','user_create',{'username':'qa_invalid','password':secrets.token_urlsafe(18),'role':'superadmin'}).status_code==422,'Unknown role rejected')
check(call('admin','user_create',{'username':'admin','password':secrets.token_urlsafe(18),'role':'sales'}).status_code==409,'Duplicate username rejected')
name='qa_users_'+uuid.uuid4().hex[:10];password=secrets.token_urlsafe(24)
r=call('admin','user_create',{'username':name.upper(),'password':password,'role':'sales'});check(r.status_code==200,'Admin creates user');uid=r.json()['id']
try:
 check(r.json()['username']==name and r.json()['role']=='sales','Username normalized and role assigned')
 with httpx.Client(base_url=base,timeout=60) as fresh:
  check(fresh.post('/api/login',json={'username':name,'password':password}).status_code==200,'New user can sign in')
  check(fresh.post('/api/accounting',json={}).status_code==403,'New user role enforced')
  check(call('admin','user_delete',{'id':uid}).status_code==200,'Admin deletes new user')
  check(fresh.post('/api/me',json={}).status_code==401,'Existing session revoked immediately')
  check(fresh.post('/api/login',json={'username':name,'password':password}).status_code==401,'Deleted user cannot sign in')
 check(next(x for x in call('admin','user_list').json()['users'] if x['id']==uid)['active'] is False,'Deletion recorded without exposing secrets')
finally:
 call('admin','user_delete',{'id':uid})
 for role in credentials:call(role,'logout')
print(f'ALL {checks} USER MANAGEMENT CHECKS PASSED',flush=True)
