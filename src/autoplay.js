const path=require('node:path');
const {tracks}=require('./util');
const webMusic=require('./web-music');
function remember(session,track) {
  session.lastTrack={...track};
  const key=track.kind==='web'?track.id:track.path;
  session.recent=(session.recent || []).filter(x=>x!==key);
  if(key)session.recent.push(key);
  session.recent=session.recent.slice(-30);
}
async function select(session,root,signal) {
  if(!session.autoplay || session.autoplayStopped || !session.lastTrack) return null;
  const last=session.lastTrack;
  if(last.kind==='web') return webMusic.recommend(last,session.recent || [],signal);
  const choices=(await tracks(root)).map(name=>({name,path:path.join(root,name),automatic:true}));
  const fresh=choices.filter(x=>!(session.recent || []).includes(x.path));
  const pool=fresh.length ? fresh : choices.filter(x=>x.path!==last.path);
  return pool.length ? pool[Math.floor(Math.random()*pool.length)] : null;
}
module.exports={remember,select};
