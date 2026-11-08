export const STORAGE_PREFIX = 'trade-starter-v1.';
export const SPEEDS = [.65,.85,1,1.1];
export const normalizeWord = value => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export function intervalIndex(items, time) {
  let low=0,high=items.length-1;
  while(low<=high){const mid=(low+high)>>1;const item=items[mid];if(time<item.start)high=mid-1;else if(time>=item.end)low=mid+1;else return mid;}
  return -1;
}
export function wordPieces(text, words) {
  const pieces=[];let cursor=0;
  words.forEach((word,index)=>{if(word.charStart>cursor)pieces.push({text:text.slice(cursor,word.charStart)});pieces.push({text:text.slice(word.charStart,word.charEnd),index});cursor=word.charEnd;});
  if(cursor<text.length)pieces.push({text:text.slice(cursor)});
  return pieces;
}
export function validateTimeline(lesson,data) {
  if(!Array.isArray(data.items)||data.items.length!==lesson.dialogue.length||!Number.isFinite(data.duration))throw Error('时间轴与课程不匹配');
  let previous=0;
  data.items.forEach((item,i)=>{
    const text=lesson.dialogue[i][1];
    if(item.speaker!==lesson.dialogue[i][0]||item.start<previous-.002||item.end<=item.start||!Array.isArray(item.words)||!item.words.length)throw Error('句子时间轴不完整');
    let end=item.start,character=0,covered='';
    item.words.forEach(word=>{
      if(word.start<item.start-.002||word.end>item.end+.1||word.start<end-.002||word.end<=word.start||word.charStart<character||word.charEnd>text.length||text.slice(word.charStart,word.charEnd)!==word.text)throw Error('单词时间轴不完整');
      covered+=normalizeWord(word.text);end=word.end;character=word.charEnd;
    });
    if(covered!==normalizeWord(text))throw Error('部分单词缺少真实时间标记');
    previous=item.end;
  });
  if(Math.abs(previous-data.duration)>.1)throw Error('音频总时长不匹配');
  return data;
}
