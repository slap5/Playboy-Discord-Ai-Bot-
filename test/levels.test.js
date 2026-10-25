const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {Levels,rank,voiceEligible}=require('../src/levels');
test('chat cooldown, duplicate filtering, thresholds and restart persistence',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'levels-'));
 try {
  const file=path.join(dir,'levels.json'),l=new Levels(file);
  assert.equal(l.chat('1','hello everyone',100000),true);
  assert.equal(l.chat('1','different message',110000),false);
  assert.equal(l.chat('1','HELLO EVERYONE',170000),false);
  assert.equal(l.chat('1','different message',170000),true);
  assert.equal(l.chat('1','hi',240000),false);
  const restored=new Levels(file);assert.equal(restored.get('1').xp,30);
  assert.equal(restored.chat('1','another message',180000),false);
  assert.equal(rank(99).level,0);assert.equal(rank(100).level,1);assert.equal(rank(400).level,2);
  fs.writeFileSync(file,'broken');assert.throws(()=>new Levels(file));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('voice XP needs a full eligible minute and resets on departure/restart',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'voice-xp-'));
 try {
  const file=path.join(dir,'levels.json'),l=new Levels(file);
  l.reconcile(['1','2'],1000);l.tick(['1','2'],60000);assert.equal(l.get('1').xp,0);
  l.tick(['1','2'],61000);assert.equal(l.get('1').xp,10);
  l.reconcile([],65000);l.tick(['1','2'],130000);assert.equal(l.get('1').xp,10);
  const restored=new Levels(file);restored.tick(['1','2'],500000);assert.equal(restored.get('1').xp,10);
  assert.equal(restored.top().length,2);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('voice eligibility excludes bots, solo, muted, deafened and AFK members',()=>{
 const state=(id,channelId,extra={})=>({id,channelId,member:{user:{bot:false}},...extra});
 const guild={afkChannelId:'afk',voiceStates:{cache:new Map([
  ['1',state('1','a')],['2',state('2','a')],['3',state('3','b')],
  ['4',state('4','a',{mute:true})],['5',state('5','a',{deaf:true})],
  ['6',state('6','a',{member:{user:{bot:true}}})],['7',state('7','afk')]
 ])}};
 assert.deepEqual(voiceEligible(guild),['1','2']);
});
