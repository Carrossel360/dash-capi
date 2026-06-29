import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: params.workspaceId },
    select: { id: true },
  })
  if (!workspace) return new NextResponse('Not found', { status: 404 })

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'https://dash-capi.vercel.app'
  const wid = params.workspaceId

  const script = `
!function(w,d){
  var cfg={wid:'${wid}',api:'${apiBase}',days:7,debug:false};
  function sc(n,v,days){var e=new Date(Date.now()+days*864e5).toUTCString();document.cookie=n+'='+encodeURIComponent(v)+';expires='+e+';path=/;SameSite=Lax'}
  function gc(n){var m=document.cookie.match(new RegExp('(?:^|;\\\\s*)'+n+'=([^;]*)'));return m?decodeURIComponent(m[1]):null}
  function gp(k){return new URLSearchParams(w.location.search).get(k)}
  function send(data){
    var fbclid=gc('_lt_fbclid'),fbp=gc('_fbp'),fbc=gc('_fbc');
    var utms={};try{utms=JSON.parse(gc('_lt_utms')||'{}')}catch(e){}
    var payload=Object.assign({workspaceId:cfg.wid,url:w.location.href,referrer:d.referrer||undefined,userAgent:navigator.userAgent,fbclid:fbclid||undefined,fbp:fbp||undefined,fbc:fbc||undefined},utms,data);
    if(cfg.debug)console.log('[LT]',payload);
    if(navigator.sendBeacon){navigator.sendBeacon(cfg.api+'/api/collect',new Blob([JSON.stringify(payload)],{type:'application/json'}))}
    else{fetch(cfg.api+'/api/collect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),keepalive:true}).catch(function(){})}
  }
  // persistir fbclid e UTMs
  var fbclid=gp('fbclid'),gclid=gp('gclid');
  if(fbclid){sc('_lt_fbclid',fbclid,cfg.days);sc('_fbc','fb.1.'+Date.now()+'.'+fbclid,cfg.days)}
  if(gclid)sc('_lt_gclid',gclid,cfg.days);
  if(!gc('_fbp'))sc('_fbp','fb.1.'+Date.now()+'.'+Math.floor(Math.random()*1e10),90);
  var utmKeys=['utm_source','utm_medium','utm_campaign','utm_content','utm_term'];
  var utms={};utmKeys.forEach(function(k){var v=gp(k);if(v)utms[k.replace('utm_','utm').replace('_','').replace('utm','utm')]=v});
  // fix utm keys to camelCase
  var utmMap={utm_source:'utmSource',utm_medium:'utmMedium',utm_campaign:'utmCampaign',utm_content:'utmContent',utm_term:'utmTerm'};
  var utmObj={};utmKeys.forEach(function(k){var v=gp(k);if(v)utmObj[utmMap[k]]=v});
  if(Object.keys(utmObj).length)sc('_lt_utms',JSON.stringify(utmObj),cfg.days);
  // watchers
  d.addEventListener('submit',function(e){
    var f=e.target,em=(f.querySelector('input[type=email]')||{}).value,ph=(f.querySelector('input[type=tel],input[name*=phone],input[name*=telefone]')||{}).value;
    send({eventType:'Lead',userEmail:em||undefined,userPhone:ph||undefined});
  },true);
  d.addEventListener('click',function(e){
    var t=(e.target).closest('a[href*="wa.me"],a[href*="whatsapp.com"],a[href*="api.whatsapp.com"]');
    if(t)send({eventType:'WhatsAppClick',customData:{url:t.href}});
    var p=(e.target).closest('a[href^="tel:"]');
    if(p)send({eventType:'Lead',customData:{type:'phone_click'}});
  },true);
  // pageview
  send({eventType:'PageView'});
  w.lt=function(cmd,data){if(cmd==='track')send({eventType:data[0],customData:data[1]})};
}(window,document);
`.trim()

  return new NextResponse(script, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
