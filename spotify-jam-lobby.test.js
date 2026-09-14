const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = __dirname;
const server = fs.readFileSync(path.join(root, 'spotify-jam-lan-server.js'), 'utf8');
function serverHarness(tribute = false) {
  let handler;
  const ctx = {
    require(name) {
      if (name === 'node:http') return {createServer(fn) { handler = fn; return {listen() {}}; }};
      if (name === 'node:fs') return {readFileSync() {return JSON.stringify({requestKey:'test-key-for-isolated-tests-only'});}, writeFileSync() {}};
      return require(name);
    }, __dirname:root, process:{env:{}}, Buffer, URL, console,
  };
  vm.createContext(ctx);
  vm.runInContext(server.replace('const TRIBUTE_ENABLED = false;', `const TRIBUTE_ENABLED = ${tribute};`), ctx);
  return {ctx, async call(route, method='GET', body={}, remote='127.0.0.1') {
    let status, data;
    const req = {url:route,method,headers:{host:'localhost'},socket:{remoteAddress:remote},on(event, callback) {
      if(event==='data') callback(JSON.stringify(body));
      if(event==='end') callback();
    }};
    await handler(req,{writeHead(code){status=code;},end(value){try{data=JSON.parse(value);}catch{data=value;}}});
    return {status,data};
  }};
}
const key='?key=test-key-for-isolated-tests-only';
test('server enforces access and challenge answers; bridge is loopback-only', async()=>{
 const h=serverHarness();
 assert.equal((await h.call('/api/availability')).status,403);
 assert.equal((await h.call('/bridge/next','GET',{},'192.0.2.1')).status,403);
 await h.call('/bridge/next');
 assert.equal((await h.call('/api/request'+key,'POST',{})).status,400);
 const c=(await h.call('/api/challenge'+key+'&tribute=1')).data;
 assert.notEqual(c.type,'tribute');
 const answer=vm.runInContext(`challenges.get(${JSON.stringify(c.id)}).answer`,h.ctx);
 const started=await h.call('/api/request'+key,'POST',{challengeId:c.id,answer});
 assert.equal(started.status,202);
 assert.equal((await h.call('/api/request'+key,'POST',{challengeId:c.id,answer})).status,400);
 const next=(await h.call('/bridge/next')).data;
 assert.ok(next.id);
 assert.equal((await h.call('/bridge/result','POST',{id:next.id,url:'https://example.com/invalid'})).status,400);
 assert.equal((await h.call('/bridge/result','POST',{id:next.id,url:'https://spotify.link/test'})).status,200);
 assert.equal((await h.call(started.data.statusUrl)).data.url,'https://spotify.link/test');
});
test('tribute toggle overrides browser forcing and enables optional tribute',async()=>{
 for(const enabled of [false,true]) {
  const h=serverHarness(enabled); await h.call('/bridge/next');
  for(let n=0;n<50;n++) assert.equal((await h.call('/api/challenge'+key+'&tribute=1')).data.type==='tribute',enabled);
 }
});
test('extension shortens the join URI, not the internal session ID',async()=>{
 let target;
 const ctx={setTimeout(){},Spicetify:{Platform:{AuthorizationAPI:{getState:()=>({token:{accessToken:'test'}})}},_platform:{getUrlDispenserServiceClient:()=>({getShortUrl:async uri=>{target=uri;return {shareable_url:'https://spotify.link/test'};}})}},fetch:async()=>({ok:true,text:async()=>JSON.stringify({session_id:'internal',join_session_uri:'spotify:socialsession:invite',join_session_token:'invite'})})};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'spotify-jam-poc.js'),'utf8'),ctx);
 assert.equal(await ctx.createSpotifyJamLink(),'https://spotify.link/test');assert.equal(target,'spotify:socialsession:invite');
});
test('resume only calls play when paused and reports unavailable playback',async()=>{
 const src=fs.readFileSync(path.join(root,'spotify-jam-poc.js'),'utf8');
 const fn=src.slice(src.indexOf('  async function resumeForJamEntry'),src.indexOf('  globalThis.createSpotifyJamLink'));
 for(const mode of ['playing','paused','empty','disabled']) {
  let playing=mode==='playing',calls=0;
  const ctx={AUTO_PLAY_ON_ENTRY:mode!=='disabled',Spicetify:{Player:{isPlaying:()=>playing,play:async()=>{calls++;if(mode==='paused')playing=true;}}},setTimeout:r=>r()};
  vm.createContext(ctx);vm.runInContext(fn,ctx);
  if(mode==='empty')await assert.rejects(ctx.resumeForJamEntry(),/selecionar uma música/);else await ctx.resumeForJamEntry();
  assert.equal(calls,['paused','empty'].includes(mode)?1:0);
 }
});
test('guest script parses',()=>{
 const html=fs.readFileSync(path.join(root,'spotify-jam-page.html'),'utf8');
 new vm.Script(html.split('<script>')[1].split('</script>')[0]);
});
