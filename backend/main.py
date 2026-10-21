"""Same-origin API. PostgreSQL is the authority for authorization and transactions."""
import os, time
from pathlib import Path
from urllib.parse import urlparse
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
load_dotenv(Path(__file__).with_name('.env'))
app=FastAPI(title='Siam Bean ERP',version='1.0.0')
COOKIE='siam_erp_session'
_attempts={}

def rpc(action,token='',data=None):
    url=os.environ['SUPABASE_URL']+'/rest/v1/rpc/siam_erp_api'
    with httpx.Client(timeout=25) as client:
        r=client.post(url,headers={'apikey':os.environ['SUPABASE_PUBLISHABLE_KEY'],'Content-Type':'application/json'},json={'p_action':action,'p_token':token,'p_data':data or {}})
        r.raise_for_status()
        return r.json()

@app.middleware('http')
async def safety(request:Request,call_next):
    if request.method in {'POST','PATCH','DELETE','PUT'}:
        origin=request.headers.get('origin')
        if origin and urlparse(origin).netloc!=request.headers.get('host'):
            return JSONResponse({'error':'Cross-origin request rejected'},403)
        try:
            if int(request.headers.get('content-length','0'))>16000: return JSONResponse({'error':'Request too large'},413)
        except ValueError: return JSONResponse({'error':'Invalid content length'},400)
    response=await call_next(request)
    response.headers['X-Content-Type-Options']='nosniff'
    response.headers['X-Frame-Options']='DENY'
    response.headers['Referrer-Policy']='strict-origin-when-cross-origin'
    if request.url.path.startswith('/api'): response.headers['Cache-Control']='no-store'
    return response

@app.get('/api/health')
def health(): return {'status':'ok','service':'Siam Bean ERP'}

@app.post('/api/{action}')
async def action(action:str,request:Request):
    try:
        data=await request.json()
        if not isinstance(data,dict): return JSONResponse({'error':'Expected a JSON object'},422)
    except Exception: return JSONResponse({'error':'Invalid JSON'},400)
    if action=='login':
        if not isinstance(data.get('username'),str) or not isinstance(data.get('password'),str) or len(data['password'])>128: return JSONResponse({'error':'Username and password required'},422)
        # Best-effort per-instance throttle; DB bcrypt protects stored passwords.
        key=(request.client.host if request.client else 'unknown',data['username'].lower())
        now=time.monotonic(); recent=[x for x in _attempts.get(key,[]) if now-x<60]
        if len(recent)>=10: return JSONResponse({'error':'Too many attempts. Try again in one minute.'},429)
        _attempts[key]=recent+[now]
    try: result=rpc(action,request.cookies.get(COOKIE,''),data)
    except (httpx.HTTPError,KeyError): return JSONResponse({'error':'Database is temporarily unavailable. Please try again.'},503)
    token=result.pop('token',None)
    response=JSONResponse(result,status_code=result.get('status',200))
    if token: response.set_cookie(COOKIE,token,max_age=8*3600,httponly=True,samesite='lax',secure=bool(os.getenv('VERCEL')))
    if action=='logout': response.delete_cookie(COOKIE)
    return response
