import {STORAGE_PREFIX,SPEEDS,normalizeWord,intervalIndex,wordPieces,validateTimeline} from './logic.js';

const $=selector=>document.querySelector(selector),audio=$('#audio'),lines=$('#lines');
const read=(key,fallback)=>{try{return localStorage.getItem(STORAGE_PREFIX+key)??fallback;}catch{return fallback;}};
const write=(key,value)=>{try{localStorage.setItem(STORAGE_PREFIX+key,String(value));}catch{}};
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const clock=value=>{const s=Math.max(0,Math.floor(Number(value)||0));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};
let lessons=[],characters={},basicWords=[],currentVocabulary=[],section=read('section','trade'),chapter='all',active=null,timeline=null,current=-1,currentWord=-1,highlightedWord=null,request=0,serial=0,pending=null,heldLine=null,clipEnd=null,loading=false,scrubbing=false,saveAt=0;
const timingCache=new Map();
let speed=Number(read('speed','.65'));if(!SPEEDS.includes(speed))speed=.65;
let knownValues=[];try{const value=JSON.parse(read('known','[]'));if(Array.isArray(value))knownValues=value.filter(word=>typeof word==='string');}catch{}
const known=new Set(knownValues);
audio.defaultPlaybackRate=speed;audio.playbackRate=speed;audio.preservesPitch=true;if('webkitPreservesPitch'in audio)audio.webkitPreservesPitch=true;
let swRegistration=null;
if('serviceWorker'in navigator&&window.isSecureContext){swRegistration=navigator.serviceWorker.register('practice-cache-sw.js').catch(()=>null);}

function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),2300);}
function saveProgress(){if(active&&timeline&&!loading&&!pending&&Number.isFinite(audio.currentTime))write(`progress.${active.id}`,audio.currentTime.toFixed(3));}
function updateTransport(){const playing=!audio.paused&&!audio.ended;$('#playLabel').textContent=playing?'❚❚ 暂停':'▶ 播放对话';$('#play').setAttribute('aria-label',playing?'暂停':'播放');$('#wave').classList.toggle('playing',playing);}
function pause(){audio.pause();saveProgress();updateTransport();}
function warm(){if(!active||!swRegistration)return;const lesson=active;swRegistration.then(reg=>{if(!reg)return;navigator.serviceWorker.ready.then(ready=>ready.active?.postMessage({type:'warm-session',assets:[lesson.audio,lesson.timings,...lesson.speakers.map(name=>characters[name].photo)]})).catch(()=>{});});}
function play(){warm();audio.playbackRate=speed;audio.preservesPitch=true;const result=audio.play();result?.catch(()=>{updateTransport();$('#playerStatus').textContent='已定位，请点播放';toast('句子已定位。请点播放按钮开始。');});}
function setTheme(theme){const light=theme==='light';document.body.classList.toggle('light-theme',light);$('#themeLabel').textContent=light?'深色模式':'浅色模式';$('#themeBtn').setAttribute('aria-label',light?'切换深色模式':'切换浅色模式');document.querySelector('meta[name=theme-color]').content=light?'#f4f8fe':'#08111f';write('theme',theme);}
$('#themeBtn').onclick=()=>setTheme(document.body.classList.contains('light-theme')?'dark':'light');setTheme(read('theme','light'));
for(let i=0;i<36;i++){const bar=document.createElement('i');bar.className='bar';bar.style.setProperty('--h',`${20+Math.abs(Math.sin(i*1.7))*85}px`);bar.style.setProperty('--d',`${(i%7)*-.12}s`);$('#wave').append(bar);}

function chapterList(){return section==='trade'?[['all','全部入门课'],['start','基础开口'],['inquiry','询盘报价'],['order','订单推进'],['followup','跟进与售后']]:[['all','全部原版故事'],['everyday','日常与工作'],['dating','约会与关系'],['circle','朋友与社交']];}
function renderLibrary(){
  const pool=lessons.filter(lesson=>lesson.section===section);
  document.querySelectorAll('.course-tab').forEach(button=>{const selected=button.dataset.section===section;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));});
  $('#libraryTitle').textContent=section==='trade'?`${pool.length} 节基础外贸`:`${pool.length} 张故事进阶`;$('#libraryHint').textContent=section==='trade'?'成人初级 · 人物进行业务角色扮演，不改原故事设定。':'原版成人社交故事 · 与外贸课程分开练习。';
  $('#chapterNav').replaceChildren();
  for(const [id,name]of chapterList()){const button=document.createElement('button');button.className=`chapter-button ${chapter===id?'active':''}`;button.type='button';button.setAttribute('aria-pressed',String(chapter===id));const count=id==='all'?pool.length:pool.filter(lesson=>lesson.chapter===id).length;button.innerHTML=`<span class="chapter-name">${name}</span><span class="chapter-count">${count} 张练习卡片</span>`;button.onclick=()=>{chapter=id;renderLibrary();};$('#chapterNav').append(button);}
  const visible=pool.filter(lesson=>chapter==='all'||lesson.chapter===chapter);$('#chapterMeta').textContent=`${visible.length} 张卡片 · 选择后可反复练习`;
  $('#sessionCards').replaceChildren();
  for(const lesson of visible){const button=document.createElement('button');button.type='button';button.className=`session-card ${active?.id===lesson.id?'active':''}`;button.setAttribute('aria-pressed',String(active?.id===lesson.id));button.innerHTML=`<span class="card-kicker">${escape(lesson.label)} · ${lesson.speakers.length} 人</span><strong>${escape(lesson.zhTitle||lesson.title)}</strong><span class="card-description">${escape(lesson.description)} · ${lesson.dialogue.length} 句</span>`;button.onclick=()=>selectLesson(lesson.id);$('#sessionCards').append(button);}
}
document.querySelectorAll('.course-tab').forEach(button=>button.onclick=()=>{if(!lessons.length||section===button.dataset.section)return;section=button.dataset.section;chapter='all';write('section',section);const pool=lessons.filter(lesson=>lesson.section===section);selectLesson(pool.find(lesson=>lesson.id===read(`last.${section}`,''))?.id||pool[0].id);});

function renderPeople(){
  const stage=$('#speakerStage'),chips=$('#speakerChips'),group=active.speakers.length>2;stage.replaceChildren();chips.replaceChildren();stage.classList.toggle('group-stage',group);chips.classList.toggle('group-speakers',group);
  active.speakers.forEach(name=>{const person=characters[name];const chip=document.createElement('span');chip.className=`speaker ${person.accent}`;chip.innerHTML=`<i></i>${name} · ${escape(person.voice)}`;chips.append(chip);const card=document.createElement('div');card.className=`portrait ${person.accent}`;card.dataset.speaker=name;card.title=person.bio||person.trait;const picture=person.crop?`<svg class="portrait-image" viewBox="${person.crop}" preserveAspectRatio="xMidYMin slice" role="img" aria-label="${name}"><image href="${person.photo}" width="1280" height="1706" /></svg>`:`<img src="${person.photo}" alt="${name}" decoding="async">`;card.innerHTML=`${picture}<div class="portrait-caption"><strong>${name}</strong><span>${escape(active.roles?.[name]||person.trait)}</span><span>${escape(person.voice)}</span></div><span class="live-dot">正在说话</span>`;stage.append(card);});
}
function renderTranscript(){
  lines.replaceChildren();highlightedWord=null;currentWord=-1;
  active.dialogue.forEach(([speaker,en,zh],index)=>{const row=document.createElement('article');row.className=`line ${speaker.toLowerCase()}`;row.dataset.index=index;row.tabIndex=0;row.setAttribute('role','button');row.setAttribute('aria-label',`播放 ${speaker} 的句子：${en}`);const english=timeline?wordPieces(en,timeline.items[index].words).map(piece=>piece.index===undefined?escape(piece.text):`<span class="word" data-word="${piece.index}">${escape(piece.text)}</span>`).join(''):escape(en);row.innerHTML=`<div class="line-marker">${speaker[0]}</div><div><div class="who">${speaker}${active.roles?`<small>${escape(active.roles[speaker]||'')}</small>`:''}</div><div class="english" lang="en-GB">${english}</div><div class="chinese">${escape(zh)}</div></div>`;row.onclick=()=>queueJump(index,true);row.onkeydown=event=>{if(event.key==='Enter'||event.code==='Space'){event.preventDefault();event.stopPropagation();queueJump(index,true);}};lines.append(row);});
  const previous=current;current=-1;setCurrent(heldLine??Math.max(0,previous),false);
}
function setCurrent(index,scroll=true){
  if(index<0||index>=active.dialogue.length)return;
  if(index!==current){lines.querySelector('.line.current')?.classList.remove('current');lines.querySelector('[aria-current=true]')?.removeAttribute('aria-current');highlightedWord?.classList.remove('speaking-word');highlightedWord=null;currentWord=-1;current=index;const row=lines.children[index];row?.classList.add('current');row?.setAttribute('aria-current','true');if(scroll&&$('#scrollToggle').checked&&row){const top=lines.scrollTop+row.getBoundingClientRect().top-lines.getBoundingClientRect().top-(lines.clientHeight-row.offsetHeight)/2;lines.scrollTo({top:Math.max(0,top),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}}
  const speaker=active.dialogue[index][0];document.querySelectorAll('.portrait').forEach(card=>card.classList.toggle('active',card.dataset.speaker===speaker));
}
function paintWord(time){
  if(!timeline||current<0)return;const index=intervalIndex(timeline.items[current].words,time);
  if(index===currentWord)return;highlightedWord?.classList.remove('speaking-word');currentWord=index;highlightedWord=index>=0?lines.children[current]?.querySelector(`[data-word="${index}"]`):null;if($('#wordToggle').checked)highlightedWord?.classList.add('speaking-word');
}
function update(){
  if(!active||!timeline||loading)return;
  const time=audio.currentTime,duration=Number.isFinite(audio.duration)?audio.duration:timeline.duration;
  $('#currentTime').textContent=clock(time);$('#duration').textContent=clock(duration);if(!scrubbing)$('#seek').value=String(Math.round(1000*time/duration));
  if(pending||heldLine!==null){setCurrent(heldLine??pending.index,false);return;}
  if(clipEnd!==null&&time>=clipEnd){clipEnd=null;pause();}
  if(clipEnd===null&&$('#loopToggle').checked&&current>=0&&!audio.paused&&time>=timeline.items[current].end-.035){const line=current;queueJump(line,true);return;}
  setCurrent(intervalIndex(timeline.items,time));paintWord(time);
  if(!audio.paused&&Date.now()-saveAt>3000){saveAt=Date.now();saveProgress();}
}
let animationFrame=null;
function frame(){update();animationFrame=audio.paused?null:requestAnimationFrame(frame);}

function queueJump(index,autoplay=false,wordIndex=null){
  if(!active||index<0||index>=active.dialogue.length)return;
  audio.pause();clipEnd=null;heldLine=index;setCurrent(index);highlightedWord?.classList.remove('speaking-word');highlightedWord=null;currentWord=-1;pending={id:active.id,index,wordIndex,autoplay,serial:++serial};flushPending();if(pending){$('#playerStatus').textContent='正在锁定所选句子…';toast('已选中，音频就绪后会准确定位。');}
}
function flushPending(){
  const job=pending;if(!job||job.id!==active?.id||!timeline||audio.readyState<1||!Number.isFinite(audio.duration))return;
  pending=null;const item=timeline.items[job.index],word=job.wordIndex===null?null:item.words[job.wordIndex];const target=Math.min((word?.start??item.start)+.002,Math.max(0,audio.duration-.02));let finished=false;
  const complete=()=>{if(finished||job.serial!==serial||job.id!==active?.id||Math.abs(audio.currentTime-target)>.12)return;finished=true;audio.removeEventListener('seeked',complete);heldLine=null;clipEnd=word?Math.min(word.end+.025,item.end):null;$('#playerStatus').textContent=word?'原句词语发音':'逐词时间轴已就绪';update();if(job.autoplay)play();};
  audio.addEventListener('seeked',complete);audio.currentTime=target;setTimeout(complete,150);setTimeout(()=>{audio.removeEventListener('seeked',complete);},8000);
}
async function selectLesson(id){
  const lesson=lessons.find(item=>item.id===id);if(!lesson)return;if(active?.id===id)return;
  saveProgress();audio.pause();serial++;request++;const token=request;active=lesson;section=lesson.section;timeline=null;pending=null;heldLine=0;clipEnd=null;current=-1;currentWord=-1;loading=true;
  write('section',section);write(`last.${section}`,lesson.id);$('#play').disabled=true;$('#seek').disabled=true;$('#seek').value='0';$('#currentTime').textContent='0:00';$('#duration').textContent='0:00';$('#playerStatus').textContent='正在准备逐词音频…';
  $('#currentSession').textContent=lesson.zhTitle||lesson.title;$('#trialLabel').textContent=lesson.label;$('#sessionTitle').textContent=lesson.title;$('#sessionZh').textContent=lesson.zhTitle||'';$('#sessionSubtitle').textContent=lesson.subtitle;$('#contextChinese').textContent=lesson.context?.zh||'';$('#contextEnglish').textContent=lesson.context?.en||'';renderLibrary();renderPeople();renderTranscript();renderVocabulary();updateTransport();
  audio.src=lesson.audio;audio.load();
  try{const data=timingCache.get(id)||await fetch(lesson.timings).then(response=>{if(!response.ok)throw Error('无法读取逐词时间轴');return response.json();});if(token!==request)return;timeline=validateTimeline(lesson,data);timingCache.set(id,timeline);loading=false;renderTranscript();renderVocabulary();$('#duration').textContent=clock(timeline.duration);ready();}
  catch(error){if(token!==request)return;loading=false;$('#playerStatus').textContent='加载失败，请刷新重试';toast(error.message);}
}
function ready(){
  if(!active||!timeline||audio.readyState<1||!Number.isFinite(audio.duration))return;
  $('#play').disabled=false;$('#seek').disabled=false;
  if(pending){flushPending();return;}
  if(heldLine!==null){const saved=Number(read(`progress.${active.id}`,'0'));heldLine=null;if(saved>0&&saved<audio.duration-.5){audio.currentTime=saved;toast('已恢复本课播放进度');}else audio.currentTime=0;}
  $('#playerStatus').textContent='逐词同步已就绪';update();
}
$('#play').onclick=()=>{if(audio.paused){clipEnd=null;play();}else pause();};
audio.addEventListener('loadedmetadata',ready);audio.addEventListener('canplay',()=>{if(pending)flushPending();});audio.addEventListener('timeupdate',update);audio.addEventListener('seeked',update);audio.addEventListener('play',()=>{updateTransport();if(animationFrame===null)animationFrame=requestAnimationFrame(frame);});audio.addEventListener('pause',updateTransport);audio.addEventListener('ended',()=>{saveProgress();updateTransport();});audio.addEventListener('waiting',()=>{$('#playerStatus').textContent='音频缓冲中…';});audio.addEventListener('playing',()=>{$('#playerStatus').textContent=clipEnd!==null?'原句词语发音':'逐词同步播放中';});audio.addEventListener('error',()=>{if(active){$('#playerStatus').textContent='音频加载失败，请刷新重试';toast('暂时无法加载音频，请检查网络后重试。');}});
function seekTo(time){if(!timeline||!Number.isFinite(audio.duration))return;serial++;pending=null;heldLine=null;clipEnd=null;audio.currentTime=Math.max(0,Math.min(audio.duration-.01,time));update();}
$('#back15').onclick=()=>seekTo(audio.currentTime-15);$('#forward15').onclick=()=>seekTo(audio.currentTime+15);$('#previous').onclick=()=>queueJump(Math.max(0,current-1),true);$('#next').onclick=()=>{if(active)queueJump(Math.min(active.dialogue.length-1,current+1),true);};$('#restartBtn').onclick=()=>queueJump(0,false);
$('#seek').addEventListener('pointerdown',()=>{scrubbing=true;});$('#seek').addEventListener('input',()=>seekTo(Number($('#seek').value)/1000*audio.duration));window.addEventListener('pointerup',()=>{scrubbing=false;});
document.querySelectorAll('.speed').forEach(button=>{button.classList.toggle('active',Number(button.dataset.speed)===speed);button.setAttribute('aria-pressed',String(Number(button.dataset.speed)===speed));button.onclick=()=>{speed=Number(button.dataset.speed);audio.defaultPlaybackRate=speed;audio.playbackRate=speed;audio.preservesPitch=true;write('speed',speed);document.querySelectorAll('.speed').forEach(item=>{const chosen=Number(item.dataset.speed)===speed;item.classList.toggle('active',chosen);item.setAttribute('aria-pressed',String(chosen));});toast(`播放速度 ${speed}×，保持音高`);};});
$('#wordToggle').checked=read('words','on')!=='off';document.body.classList.toggle('words-off',!$('#wordToggle').checked);$('#wordToggle').onchange=()=>{document.body.classList.toggle('words-off',!$('#wordToggle').checked);write('words',$('#wordToggle').checked?'on':'off');currentWord=-1;paintWord(audio.currentTime);};
$('#translationBtn').onclick=()=>{const off=document.body.classList.toggle('translation-off');$('#translationBtn').classList.toggle('active',!off);$('#translationBtn').setAttribute('aria-pressed',String(!off));write('translation',off?'off':'on');};
if(read('translation','on')==='off')$('#translationBtn').click();
$('#englishBtn').onclick=()=>{const on=document.body.classList.toggle('english-only');$('#englishBtn').classList.toggle('active',on);$('#englishBtn').setAttribute('aria-pressed',String(on));};
$('#resetProgress').onclick=()=>{if(active){write(`progress.${active.id}`,'0');queueJump(0,false);toast('本课播放进度已清除；词汇记录仍保留。');}};

function vocabularyFor(lesson){
  if(lesson.vocabulary?.length)return lesson.vocabulary;
  const all=[...basicWords,...lessons.filter(item=>item.section==='trade').flatMap(item=>item.vocabulary)],seen=new Set();return all.filter(entry=>{const key=normalizeWord(entry.word);if(seen.has(key))return false;seen.add(key);return lesson.dialogue.some(turn=>turn[1].match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu)?.some(word=>normalizeWord(word)===key));}).slice(0,8).map(entry=>{const turn=lesson.dialogue.find(item=>item[1].match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu)?.some(word=>normalizeWord(word)===normalizeWord(entry.word)));return {...entry,example:turn[1],exampleZh:turn[2]};});
}
function findWord(entry){if(!timeline)return null;for(let line=0;line<timeline.items.length;line++){const word=timeline.items[line].words.findIndex(item=>normalizeWord(item.text)===normalizeWord(entry.word));if(word>=0)return {line,word};}return null;}
function renderVocabulary(){
  currentVocabulary=vocabularyFor(active);$('#vocabGrid').replaceChildren();let count=0;
  currentVocabulary.forEach(entry=>{const key=normalizeWord(entry.word),isKnown=known.has(key),card=document.createElement('div');if(isKnown)count++;card.className=`vocab-card ${isKnown?'known':''}`;const location=findWord(entry);card.innerHTML=`<div class="vocab-card-head"><div><div class="vocab-word" lang="en">${escape(entry.word)}</div><div class="vocab-ipa">${escape(entry.ipa||'')}</div></div><button class="word-audio" type="button" aria-label="听 ${escape(entry.word)} 的原句发音" ${location?'':'disabled'}>🔊</button></div><p class="vocab-meaning">${escape(entry.zh)}</p><p class="vocab-example" lang="en">${escape(entry.example)}</p><p class="vocab-example-zh">${escape(entry.exampleZh)}</p><label class="known-label"><input type="checkbox" ${isKnown?'checked':''}>这个词我认识</label>`;card.querySelector('.word-audio').onclick=()=>{const target=findWord(entry);if(target)queueJump(target.line,true,target.word);};card.querySelector('input').onchange=event=>{if(event.target.checked)known.add(key);else known.delete(key);write('known',JSON.stringify([...known]));renderVocabulary();};$('#vocabGrid').append(card);});
  $('#vocabCount').textContent=`认识 ${count} / ${currentVocabulary.length}`;if(!currentVocabulary.length)$('#vocabGrid').textContent='这课先以完整句理解为主，可以切换到入门课练习重点词。';
}
function fitTranscript(){const shell=$('#transcriptShell'),player=$('.player');if(window.innerWidth>940)shell.style.height=`${player.offsetHeight}px`;else shell.style.removeProperty('height');}
new ResizeObserver(fitTranscript).observe($('.player'));window.addEventListener('resize',fitTranscript);window.addEventListener('pagehide',saveProgress);document.addEventListener('visibilitychange',()=>{if(document.hidden&&clipEnd!==null){clipEnd=null;pause();}});
document.addEventListener('keydown',event=>{if(event.target.closest('button,input,textarea,select,a,[role=button]'))return;if(event.code==='Space'){event.preventDefault();audio.paused?play():pause();}if(event.key==='ArrowLeft')seekTo(audio.currentTime-5);if(event.key==='ArrowRight')seekTo(audio.currentTime+5);if(event.key.toLowerCase()==='l')$('#loopToggle').click();if(event.key.toLowerCase()==='t')$('#translationBtn').click();});

try{
  const fetchJSON=url=>fetch(url).then(response=>{if(!response.ok)throw Error(`无法读取 ${url}`);return response.json();});
  const [trade,advanced,people,vocabulary]=await Promise.all(['trade.json','advanced.json','characters.json','base-vocabulary.json'].map(fetchJSON));
  $('#tradeCourseSummary').textContent=`${trade.length} 节短对话 · 适合初级`;
  lessons=[...trade,...advanced];characters=people;basicWords=vocabulary;if(!['trade','advanced'].includes(section))section='trade';const pool=lessons.filter(lesson=>lesson.section===section);const first=pool.find(lesson=>lesson.id===read(`last.${section}`,''))||pool[0];await selectLesson(first.id);fitTranscript();
}catch(error){$('#sessionTitle').textContent='课程暂时无法加载';$('#sessionSubtitle').textContent='请检查网络后刷新页面，无需配置账号或密钥。';lines.innerHTML=`<p class="error-note">${escape(error.message)}</p>`;$('#play').disabled=true;}
