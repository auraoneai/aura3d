(() => {
 'use strict';
 let banner=null,adminLink=null,busy=false;
 async function refresh(){
  if(busy)return;
  try{
   const response=await fetch('/api/auth/get-session',{cache:'no-store'});
   if(!response.ok)return;
   const session=await response.json();
   const homeAccount=document.getElementById('home-account');
   const isAdmin=Boolean(session?.user?.role?.split(',').includes('admin'));
   if(homeAccount){
    const signedIn=Boolean(session?.user);
    document.getElementById('home-sign-in').hidden=signedIn;
    const signup=document.getElementById('home-sign-up');if(signup)signup.hidden=signedIn;
    homeAccount.hidden=!signedIn;
    document.getElementById('home-admin').hidden=!isAdmin||Boolean(session?.session?.impersonatedBy);
    const logout=document.getElementById('home-sign-out');logout.hidden=!signedIn;
    logout.onclick=async()=>{
     if(busy)return;busy=true;logout.disabled=true;logout.textContent='Signing out…';
     try{
      const result=await fetch('/api/auth/sign-out',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      if(!result.ok)throw Error();
      window.location.assign('/');
     }catch{busy=false;logout.disabled=false;logout.textContent='Retry sign out';}
    };
   }
   banner?.remove();banner=null;
   adminLink?.remove();adminLink=null;
   const impersonating=Boolean(session?.session?.impersonatedBy);
   if(!impersonating&&(!isAdmin||homeAccount))return;
   const signOut=document.getElementById('tour-sign-out');
   if(!impersonating&&signOut){
    adminLink=document.createElement('a');adminLink.href='/account/admin';adminLink.textContent='Admin';
    adminLink.id='tour-admin';
    signOut.before(adminLink);
    return;
   }
   if(!impersonating){
    const navigation=document.querySelector('header nav');
    if(navigation){
     adminLink=document.createElement('a');adminLink.href='/account/admin';adminLink.textContent='Admin';
     navigation.append(adminLink);
    }
    return;
   }
   banner=document.createElement('aside');banner.setAttribute('aria-label',impersonating?'Impersonation session':'Administrator navigation');
   banner.style.cssText='position:fixed;bottom:12px;left:12px;right:12px;z-index:1000;display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:12px 16px;border:1px solid #d9f67b;border-radius:6px;background:#102d35;color:#f4f2e9;font:14px/1.4 system-ui;box-shadow:0 4px 24px #0005';
   const label=document.createElement('span');label.textContent=impersonating?'Viewing as '+session.user.email:'Administrator';banner.append(label);
   const control=document.createElement(impersonating?'button':'a');
   control.style.cssText='margin-left:auto;background:#d9f67b;color:#102d35;padding:10px 14px;border:0;border-radius:4px;font:600 14px system-ui;cursor:pointer;text-decoration:none';
   control.textContent=impersonating?'Return to admin':'Open admin';
   if(!impersonating)control.href='/account/admin';
   else control.onclick=async()=>{
    if(busy)return;busy=true;control.disabled=true;control.textContent='Returning…';
    try{const r=await fetch('/api/auth/admin/stop-impersonating',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.ok)throw Error();window.location.assign('/account/admin');}
    catch{busy=false;control.disabled=false;control.textContent='Retry return to admin';label.textContent='Could not end impersonation. Please try again.';}
   };
   banner.append(control);document.body.append(banner);
  }catch{/* Keep a visible return control on a temporary network failure. */}
 }
 void refresh();
 let tourUserId=window.TennisTour?.snapshot().user?.id;
 window.TennisTour?.subscribe(()=>{
  const userId=window.TennisTour.snapshot().user?.id;
  if(userId===tourUserId)return;
  tourUserId=userId;
  if(!userId){adminLink?.remove();adminLink=null;}
  else void refresh();
 });
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
})();
