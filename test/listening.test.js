const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
test('automatic listening includes humans and preserves opt-outs across rejoin',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/index.js'),'utf8');
 const context=vm.createContext({});
 vm.runInContext(source.slice(source.indexOf('function autoListen'),source.indexOf('async function join')),context);
 const s={consent:new Set(),optedOut:new Set()};
 const human={id:'human',user:{bot:false}},bot={id:'bot',user:{bot:true}};
 assert.equal(context.autoListen(s,human),true);assert.ok(s.consent.has('human'));
 assert.equal(context.autoListen(s,bot),false);assert.equal(context.autoListen(s,null),false);
 s.optedOut.add('human');s.consent.delete('human');
 assert.equal(context.autoListen(s,human),false);assert.equal(s.consent.has('human'),false);
 s.optedOut.delete('human');assert.equal(context.autoListen(s,human),true);
});
