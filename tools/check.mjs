import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {STORAGE_PREFIX,SPEEDS,normalizeWord,intervalIndex,wordPieces,validateTimeline} from '../logic.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const json=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
const trade=json('trade.json'),advanced=json('advanced.json'),characters=json('characters.json'),lessons=[...trade,...advanced];
assert.equal(trade.length,12);assert.equal(advanced.length,36);assert.equal(Object.keys(characters).length,6);assert.equal(new Set(lessons.map(x=>x.id)).size,lessons.length);
assert.deepEqual(SPEEDS,[.65,.85,1,1.1]);assert.equal(STORAGE_PREFIX,'trade-starter-v1.');
let words=0;
for(const lesson of lessons){
  assert(lesson.context.en && lesson.speakers.length>=2);
  assert.deepEqual(new Set(lesson.speakers),new Set(lesson.dialogue.map(turn=>turn[0])));
  assert(fs.existsSync(path.join(root,lesson.audio)),`${lesson.id}: audio`);
  const timeline=validateTimeline(lesson,json(lesson.timings));
  for(let line=0;line<lesson.dialogue.length;line++){
    const text=lesson.dialogue[line][1],item=timeline.items[line];
    assert.equal(wordPieces(text,item.words).map(piece=>piece.text).join(''),text,`${lesson.id}: text reconstruction`);
    for(let i=0;i<item.words.length;i++){
      const word=item.words[i],mid=(word.start+word.end)/2;words++;
      assert.equal(intervalIndex(timeline.items,mid),line);
      // Media currentTime, not wall time, drives the highlight at every speed.
      for(const speed of SPEEDS)assert.equal(intervalIndex(item.words,(mid/speed)*speed),i);
    }
  }
  if(lesson.section==='trade'){
    assert.equal(lesson.dialogue.length,12);assert.equal(lesson.vocabulary.length,6);
    for(const entry of lesson.vocabulary){assert(entry.zh&&entry.ipa&&entry.exampleZh);assert(timeline.items.some(line=>line.words.some(word=>normalizeWord(word.text)===normalizeWord(entry.word))),`${lesson.id}: word audio ${entry.word}`);}
  }
}
for(const person of Object.values(characters)){assert(fs.existsSync(path.join(root,person.photo)));if(person.crop){const [x,y,w,h]=person.crop.split(' ').map(Number);assert(x>=0&&y>=0&&x+w<=1280&&y+h<=1706);}}
const app=fs.readFileSync(path.join(root,'app.js'),'utf8'),sw=fs.readFileSync(path.join(root,'practice-cache-sw.js'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
new vm.Script(sw);assert(!app.includes('speaking-studio-progress'));assert(!app.includes('speechSynthesis'));assert(sw.includes('trade-starter-assets-')&&!sw.includes('british-speaking-studio-practice-'));assert(html.includes('data-speed="0.65"'));assert(app.includes('requestAnimationFrame(frame)'));
assert.equal(fs.existsSync(path.join(root,'.openai')),false);
const vocabularyCount=trade.reduce((total,lesson)=>total+lesson.vocabulary.length,0);
console.log(`PASS: ${trade.length} trade lessons + ${advanced.length} original stories; ${words} exact word intervals; .65/.85/1/1.1 highlight lookup; ${vocabularyCount} vocabulary clips; isolated storage/cache.`);
