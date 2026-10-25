const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
function rank(xp=0) {
  const level=Math.floor(Math.sqrt(xp/100));
  return {xp,level,progress:xp-100*level*level,needed:100*(level+1)**2-100*level*level};
}
class Levels {
  constructor(file) {
    this.file=file;this.voice=new Map();this.users={};
    if(fs.existsSync(file)) {
      const data=JSON.parse(fs.readFileSync(file,'utf8'));
      if(data.version!==1 || !data.users || typeof data.users!=='object' || Array.isArray(data.users)) throw new Error('Invalid XP data. Restore data/levels.json from a backup; do not delete it.');
      for(const [id,u] of Object.entries(data.users)) {
        if(!/^\d+$/.test(id) || !Number.isSafeInteger(u.xp) || u.xp<0 || !Number.isFinite(u.lastText)) throw new Error('Invalid XP record. Restore your XP backup.');
      }
      this.users=data.users;
    }
  }
  save() {
    fs.mkdirSync(path.dirname(this.file),{recursive:true});
    const temp=this.file+'.tmp';
    fs.writeFileSync(temp,JSON.stringify({version:1,users:this.users},null,2));
    fs.renameSync(temp,this.file);
  }
  user(id) {return this.users[id] || (this.users[id]={xp:0,lastText:0,lastHash:''});}
  chat(id,content,now=Date.now()) {
    if(content.trim().length<5)return false;
    const hash=createHash('sha256').update(content.trim().toLowerCase().replace(/\s+/g,' ')).digest('hex');
    const u=this.user(id);
    if((u.lastText && now-u.lastText<60000) || u.lastHash===hash)return false;
    u.xp+=15;u.lastText=now;u.lastHash=hash;this.save();return true;
  }
  reconcile(ids,now=Date.now()) {
    const eligible=new Set(ids);
    for(const id of this.voice.keys())if(!eligible.has(id))this.voice.delete(id);
    for(const id of eligible)if(!this.voice.has(id))this.voice.set(id,now);
  }
  tick(ids,now=Date.now()) {
    this.reconcile(ids,now);let changed=false;
    for(const [id,since] of this.voice)if(now-since>=60000) {
      this.user(id).xp+=10;this.voice.set(id,now);changed=true;
    }
    if(changed)this.save();
  }
  get(id) {return rank(this.users[id]?.xp || 0);}
  top() {return Object.entries(this.users).sort((a,b)=>b[1].xp-a[1].xp || a[0].localeCompare(b[0])).slice(0,10).map(([id,u])=>({id,...rank(u.xp)}));}
}
function voiceEligible(guild) {
  const groups=new Map();
  for(const state of guild.voiceStates.cache.values()) {
    if(!state.member || state.member.user.bot || !state.channelId || state.channelId===guild.afkChannelId || state.mute || state.deaf)continue;
    if(!groups.has(state.channelId))groups.set(state.channelId,[]);
    groups.get(state.channelId).push(state.id);
  }
  return [...groups.values()].filter(ids=>ids.length>=2).flat();
}
module.exports={Levels,rank,voiceEligible};
