const fs = require('node:fs/promises');
const path = require('node:path');
function pcmToWav(pcm) {
  const h = Buffer.alloc(44);
  h.write('RIFF'); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20);
  h.writeUInt16LE(2, 22); h.writeUInt32LE(48000, 24); h.writeUInt32LE(192000, 28);
  h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
async function tracks(root) {
  return (await fs.readdir(root, {withFileTypes:true}))
    .filter(x => x.isFile() && /\.(mp3|wav|ogg|flac|m4a)$/i.test(x.name))
    .map(x => x.name).sort();
}
async function resolveTrack(root, name) {
  const names = await tracks(root);
  const exact = names.find(x => x.toLowerCase() === name.toLowerCase());
  const matches = exact ? [exact] : names.filter(x => x.toLowerCase().includes(name.toLowerCase()));
  if (!name || matches.length !== 1) throw new Error(matches.length > 1 ? 'Several tracks match. Use the full filename from !tracks.' : 'Track not found. Use !tracks to list music files.');
  // Only regular files from the directory listing, never paths or symlinks.
  return {name:matches[0], path:path.join(root, matches[0])};
}
function stripEmojis(text) {
  return String(text || '')
    .replace(/<a?:[A-Za-z0-9_]+:\d+>/g, '')
    .replace(/[0-9#*]\uFE0F?\u20E3/gu, '')
    .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u200D\uFE0E\uFE0F\u{E0020}-\u{E007F}]/gu, '')
    .trim();
}
function speechText(text) {
  return stripEmojis(text)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*`_~]/g, '')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s*|[-+]\s+)/gm, '')
    .replace(/\s+/g, ' ').trim();
}
function speechChunks(text, limit=190) {
  if (!Number.isInteger(limit) || limit < 2) throw new Error('Invalid speech chunk limit');
  let rest=text.replace(/\s+/g,' ').trim();
  const chunks=[];
  while (rest.length > limit) {
    let end=rest.lastIndexOf(' ',limit);
    if (end < 1) {
      end=limit;
      // Do not split a Unicode surrogate pair at a hard boundary.
      if (/^[\uDC00-\uDFFF]$/.test(rest[end])) end--;
    }
    chunks.push(rest.slice(0,end)); rest=rest.slice(end).trimStart();
  }
  if(rest) chunks.push(rest);
  return chunks;
}
function parseMusicCommand(text, wake='') {
  let input=text.trim().replace(/[.!?]+$/g,'').trim();
  // A configured wake word must lead a music command (optional "hey").
  if(wake) {
    const escaped=wake.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const prefix=new RegExp('^(?:hey\\s+)?'+escaped+'(?:[,:]\\s*|\\s+)','i');
    if(!prefix.test(input)) return null;
    input=input.replace(prefix,'');
  }
  input=input.replace(/^(?:(?:can|could|would|will) you\s+|(?:i would|i[’']d) like you to\s+)?(?:please[\s,]+)?/i,'');
  if(/^(?:stop|stop (?:the )?music)(?: please)?$/i.test(input)) return {action:'stop'};
  if(/^(?:skip|skip (?:this |the )?(?:song|track)|next song)(?: please)?$/i.test(input)) return {action:'skip'};
  const auto=input.match(/^(?:turn\s+)?auto\s?play\s+(on|off)$/i);
  if(auto) return {action:'autoplay',enabled:auto[1].toLowerCase()==='on'};
  const play=input.match(/^(?:play|put on|queue)(?=$|[\s,:.!?—-])[\s,:.!?—-]*(.*)$/i);
  if(play) return {action:'play',query:play[1].replace(/\s+please$/i,'').trim()};
  return null;
}
function voiceName(name) {
  return name.replace(/\.(mp3|wav|ogg|flac|m4a)$/i,'').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}
async function resolveVoiceTrack(root, query) {
  const names=await tracks(root), needle=voiceName(query);
  const exact=names.filter(n=>voiceName(n)===needle);
  const matches=exact.length ? exact : names.filter(n=>voiceName(n).includes(needle));
  if(!needle || !matches.length) throw new Error('No matching music file. Type !tracks to see the available filenames.');
  if(matches.length>1) throw new Error('Several music files match. Say a more specific filename.');
  return {name:matches[0],path:path.join(root,matches[0])};
}
function activatedRequest(transcript) {
  // Require a leading address, not an incidental mention elsewhere in a sentence.
  const normalized=String(transcript || '').normalize('NFKC').trim().replace(/^[\s"'“”‘’]+/u,'');
  const match=normalized.match(/^(?:(?:hey|hi|hello|okay|ok|yo)[\s,.:!?;—-]+)?play[\s-]*boy(?=$|[\s,.:!?;—-])[\s,.:!?;—-]*(.*)$/is);
  if(!match) return null;
  const request=match[1].trim();
  return /[\p{L}\p{N}]/u.test(request) ? request : null;
}
module.exports = {pcmToWav, tracks, resolveTrack, stripEmojis, speechText, speechChunks, parseMusicCommand, resolveVoiceTrack, activatedRequest};
