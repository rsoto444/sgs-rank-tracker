// The tracking snippet. Add to a site with:
// <script defer src="https://YOUR-TRACKER/t.js" data-site="SITE_KEY"></script>
export function GET(req: Request) {
  const endpoint = new URL("/api/collect", req.url).toString();
  const js = `(function(){
var s=document.currentScript,k=s&&s.getAttribute("data-site");if(!k||navigator.webdriver)return;
var last;function send(){var p=location.pathname;if(p===last)return;last=p;
var d=JSON.stringify({k:k,p:p,r:document.referrer,w:window.innerWidth});
if(navigator.sendBeacon){navigator.sendBeacon(${JSON.stringify(endpoint)},d)}else{fetch(${JSON.stringify(endpoint)},{method:"POST",body:d,keepalive:true})}}
var ps=history.pushState;history.pushState=function(){ps.apply(this,arguments);send()};
addEventListener("popstate",send);send();})();`;
  return new Response(js, {
    headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
