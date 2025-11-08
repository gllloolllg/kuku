/* =========================================================
 * 九九アプリ（バニラJS）- CORS不要版
 * - GET/status : JSONP
 * - POST       : hidden iframe フォーム送信
 * ======================================================= */


// ▼ 端末内保存（localStorage）
// 保存形式: { "1":{"anki_test":"2025-01-01T12:34:56+09:00","final_test":null}, ... }
const LS_KEY = 'kukuPassStatus';

function loadLocalStatus(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    // 1..9の枠を用意
    return Array.from({length:9}, (_,i)=>{
      const d = String(i+1);
      const row = obj[d] || {};
      return { dan: i+1, anki_test: row.anki_test ?? null, final_test: row.final_test ?? null };
    });
  }catch{ /* 破損時は初期化 */ 
    return Array.from({length:9}, (_,i)=>({ dan:i+1, anki_test:null, final_test:null }));
  }
}

function saveLocalPass(dan, mode){
  const now = new Date();
  const tz = Intl.DateTimeFormat('ja-JP', { timeZone:'Asia/Tokyo', hour12:false });
  // ISO風に一発整形（厳密ISO不要なら簡易でOK）
  const iso = new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().replace('Z','+09:00');

  const raw = localStorage.getItem(LS_KEY);
  const obj = raw ? JSON.parse(raw) : {};
  const key = String(dan);
  obj[key] = obj[key] || { anki_test:null, final_test:null };
  obj[key][mode] = iso;
  localStorage.setItem(LS_KEY, JSON.stringify(obj));
  return iso;
}

// ▼ 合格取り消し（localStorage から該当モードを null に）
function clearLocalPass(dan, mode){
  const raw = localStorage.getItem(LS_KEY);
  const obj = raw ? JSON.parse(raw) : {};
  const key = String(dan);
  if (!obj[key]) obj[key] = { anki_test:null, final_test:null };
  obj[key][mode] = null;
  localStorage.setItem(LS_KEY, JSON.stringify(obj));
}




const MODES = {
  ANKI: 'memorize',
  ANSHO: 'recite',
  ANKI_TEST: 'anki_test',
  FINAL_TEST: 'final_test'
};
const MODE_LABEL = {
  [MODES.ANKI]: 'あんき',
  [MODES.ANSHO]: 'れんしゅう',
  [MODES.ANKI_TEST]: 'あんきテスト',
  [MODES.FINAL_TEST]: '九九テスト'
};

function ensureClientId(){
  const key='kukuClientId';
  let id=localStorage.getItem(key);
  if(!id){ id=(crypto.randomUUID?crypto.randomUUID():Date.now()+Math.random().toString(16).slice(2)); localStorage.setItem(key,id); }
  return id;
}
const CLIENT_ID = ensureClientId();

let passStatus = loadLocalStatus();

const appEl = document.getElementById('app');
const titleEl = document.getElementById('app-title');

/* ---------- JSONP ---------- */
function jsonp(url){
  return new Promise((resolve,reject)=>{
    const cb='cb_'+Math.random().toString(36).slice(2);
    const s=document.createElement('script');
    const sep = url.includes('?') ? '&' : '?';
    s.src = `${url}${sep}callback=${cb}`;
    let cleaned=false;
    function cleanup(){ if(cleaned) return; cleaned=true; delete window[cb]; s.remove(); }
    window[cb]=(data)=>{ resolve(data); cleanup(); };
    s.onerror=()=>{ reject(new Error('JSONP failed')); cleanup(); };
    document.body.appendChild(s);
    setTimeout(()=>{ reject(new Error('JSONP timeout')); cleanup(); }, 15000);
  });
}

/* ---------- ステータス取得(JSONP) ---------- */
async function fetchStatus(){
  passStatus = loadLocalStatus();
  if (currentView.kind === 'menu') renderMenu();
  if (currentView.kind === 'mode-select') renderModeSelect(currentView.dan);
}

/* ---------- フォームPOST（hidden iframe） ---------- */
function postViaForm(url, data){
  return new Promise((resolve)=>{
    const iframe = document.createElement('iframe');
    iframe.name = 'hidden_post_' + Math.random().toString(36).slice(2);
    iframe.style.display='none';
    document.body.appendChild(iframe);

    const form = document.createElement('form');
    form.method='POST';
    form.action=url;
    form.target=iframe.name;

    Object.entries(data).forEach(([k,v])=>{
      const input=document.createElement('input');
      input.type='hidden';
      input.name=k;
      input.value=String(v);
      form.appendChild(input);
    });

    document.body.appendChild(form);
    iframe.addEventListener('load', ()=>{
      resolve({ok:true}); // レスポンスは読まない（仕様上エラー表示不要）
      setTimeout(()=>{ form.remove(); iframe.remove(); }, 0);
    }, { once:true });

    form.submit();
  });
}

/* ---------- 合格送信（フォームPOSTに変更） ---------- */
// 新: 即時ローカル保存
async function sendPass(dan, mode){
  saveLocalPass(dan, mode); 
  return { ok:true };
}


/* ---------- 画面遷移/描画 ---------- */
let currentView = { kind:'menu' };

function setView(v){
  currentView = v;
  switch(v.kind){
    case 'menu': renderMenu(); break;
    case 'mode-select': renderModeSelect(v.dan); break;
    case 'memorize': renderMemorize(v.dan); break;
    case 'recite': renderRecite(v.dan); break;
    case 'anki-test': renderAnkiTest(v.dan); break;
    case 'final-test': renderFinalTest(v.dan); break;
  }
  window.scrollTo({top:0, behavior:'smooth'}); appEl.focus();
}

function passBadge(dan, modeKey){
  const status = passStatus[dan-1]?.[modeKey];
  return status
    ? `<span class="badge" aria-label="合格済み"><img class="icon-pass" src="/image/goukaku.png" alt="合格"></span>`
    : `<span class="badge unpassed" aria-label="未合格">
          <img class="icon-pass" src="./image/goukaku.png" alt="未合格">
       </span>`;
}

function renderMenu(){
  titleEl.textContent='九九アプリ';
  appEl.innerHTML=`
    <section class="card">
      <ul class="list" role="list">
        ${Array.from({length:9}, (_,i)=>{
          const dan=i+1;
          return `
            <li class="row">
              <button class="btn block" data-action="open-mode" data-dan="${dan}" aria-label="${dan}のだんを開く">${dan}のだん</button>
              <div class="right" aria-label="合格状況">
                ${passBadge(dan,'anki_test')}
                ${passBadge(dan,'final_test')}
              </div>
            </li>`;
        }).join('')}
      </ul>
    </section>`;
  appEl.querySelectorAll('[data-action="open-mode"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const dan=Number(btn.dataset.dan);
      setView({kind:'mode-select', dan});
    });
  });
}

function renderModeSelect(dan){
  titleEl.textContent=`${dan}のだん`;
  appEl.innerHTML=`
    <section class="card">
      <div class="grid-4">
        <button class="btn" data-mode="${MODES.ANKI}">${MODE_LABEL[MODES.ANKI]}</button>
        <button class="btn" data-mode="${MODES.ANSHO}">${MODE_LABEL[MODES.ANSHO]}</button>
        <div>
          <button class="btn" data-mode="${MODES.ANKI_TEST}">${MODE_LABEL[MODES.ANKI_TEST]}</button>
          <div style="margin-top:6px">${passBadge(dan,'anki_test')}</div>
        </div>
        <div>
          <button class="btn" data-mode="${MODES.FINAL_TEST}">${MODE_LABEL[MODES.FINAL_TEST]}</button>
          <div style="margin-top:6px">${passBadge(dan,'final_test')}</div>
        </div>
      </div>
    </section>
    <div class="controls-bottom">
      <button class="btn" id="back-menu">メニューに戻る</button>
    </div>`;
  appEl.querySelector('#back-menu').addEventListener('click', ()=>setView({kind:'menu'}));
  appEl.querySelectorAll('[data-mode]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const mode=btn.dataset.mode;
      if(mode===MODES.ANKI) setView({kind:'memorize', dan});
      else if(mode===MODES.ANSHO) setView({kind:'recite', dan});
      else if(mode===MODES.ANKI_TEST) setView({kind:'anki-test', dan});
      else if(mode===MODES.FINAL_TEST) setView({kind:'final-test', dan});
    });
  });
}

// ▼ 九九の読み（1〜9の段、index1〜9）
// 配列先頭はnullにして1始まりで扱います
const READINGS = {
  1: [null,
    'いんいち　が　いち',
    'いんに　が に',
    'いんさん　が　さん',
    'いんし　が　し',
    'いんご　が　ご',
    'いんろく　が　ろく',
    'いんしち　が　しち',
    'いんはち　が　はち',
    'いんく　が　く'
  ],
  2: [null,
    'にいち　が　に',
    'ににん　が　し',
    'にさん　が　ろく',
    'にし　が　はち',
    'にご　じゅう',
    'にろく　じゅうに',
    'にしち　じゅうし',
    'にはち　じゅうろく',
    'にく　じゅうはち'
  ],
  3: [null,
    'さんいち　が さん',
    'さんに　が　ろく',
    'さざん　が　く',
    'さんし　じゅうに',
    'さんご　じゅうご',
    'さぶろく　じゅうはち',
    'さんしち　にじゅういち',
    'さんぱ　にじゅうし',
    'さんく　にじゅうしち'
  ],
  4: [null,
    'しいち　が　し',
    'しに　が　はち',
    'しさん　じゅうに',
    'しし　じゅうろく',
    'しご　にじゅう',
    'しろく　にじゅうし',
    'ししち　にじゅうはち',
    'しは　さんじゅうに',
    'しく　さんじゅうろく'
  ],
  5: [null,
    'ごいち　が　ご',
    'ごに　じゅう',
    'ごさん　じゅうご',
    'ごし　にじゅう',
    'ごご　にじゅうご',
    'ごろく　さんじゅう',
    'ごしち　さんじゅうご',
    'ごは　しじゅう',
    'ごっく　しじゅうご'
  ],
  6: [null,
    'ろくいち　が　ろく',
    'ろくに　じゅうに',
    'ろくさん　じゅうはち',
    'ろくし　にじゅうし',
    'ろくご　さんじゅう',
    'ろくろく さんじゅうろく',
    'ろくしち　しじゅうに',
    'ろくは　しじゅうはち',
    'ろっく　ごじゅうし'
  ],
  7: [null,
    'しちいち　が　しち',
    'しちに　じゅうし',
    'しちさん　にじゅういち',
    'しちし　にじゅうはち',
    'しちご　さんじゅうご',
    'しちろく　しじゅうに',
    'しちしち　しじゅうく',
    'しちは　ごじゅうろく',
    'しちく　ろくじゅうさん'
  ],
  8: [null,
    'はちいち　が　はち',
    'はちに　じゅうろく',
    'はっさん　にじゅうし',
    'はちし　さんじゅうに',
    'はちご　しじゅう',
    'はちろく　しじゅうはち',
    'はちしち　ごじゅうろく',
    'はっぱ　ろくじゅうし',
    'はっく　しちじゅうに'
  ],
  9: [null,
    'くいち　が　く',
    'くに　じゅうはち',
    'くさんにじゅうしち',
    'くし　さんじゅうろく',
    'くご　しじゅうご',
    'くろく　ごじゅうし',
    'くしち　ろくじゅうさん',
    'くは　しちじゅうに',
    'くく　はちじゅういち'
  ]
};

// ▼ 読み取得関数（該当がない場合は「n×i」表示）
function readingNI(n, i) {
  const r = READINGS?.[n]?.[i];
  return r ?? `${n}×${i}`;
}


// ▼ 数式と答え　〇×〇=〇
function formulaNI(n, i) {
  return `${n}×${i}=${n * i}`;
}

function oneToNine(){ return Array.from({length:9},(_,i)=>i+1); }


/** ========== 画面：あんき ========== */
function renderMemorize(dan){
  titleEl.textContent=`${dan}のだん ・ ${MODE_LABEL[MODES.ANKI]}`;
  appEl.innerHTML=`
    <section class="card">
      <div class="kuku-list">
        ${oneToNine().map(i=>`
          <div class="kuku-item">
            <p class="kuku-reading">${readingNI(dan,i)}</p>
            <div class="kuku-formula">${formulaNI(dan,i)}</div>
          </div>`).join('')}
      </div>
    </section>
    <div class="controls-bottom">
      <button class="btn" id="back">戻る</button>
    </div>`;
  appEl.querySelector('#back').addEventListener('click', ()=>setView({kind:'mode-select', dan}));
}

/** ========== 画面：れんしゅう（初期は読み非表示／タップで答え＋読みを表示） ========== */
function renderRecite(dan) {
  titleEl.textContent = `${dan}の段 ・ ${MODE_LABEL[MODES.ANSHO]}`;
  appEl.innerHTML = `
    <section class="card">
      <div class="kuku-list">
        ${oneToNine().map(i => `
          <div class="kuku-item" data-i="${i}">
            <!-- 初期は式のみ（答えなし） -->
            <div class="kuku-formula tappable" role="button" tabindex="0"
                 aria-label="タップで答えと読みを表示">${dan}×${i}</div>
            <!-- 初期は読みを非表示 -->
            <p class="kuku-reading sr-only" aria-live="polite">${readingNI(dan, i)}</p>
          </div>
        `).join('')}
      </div>
    </section>
    <div class="controls-bottom">
      <button class="btn" id="back">戻る</button>
    </div>
  `;

  // タップで「答え付きの式」と「読み」を表示（※再タップしても戻さない）
  appEl.querySelectorAll('.kuku-item').forEach(item => {
    const i = Number(item.dataset.i);
    const formula = item.querySelector('.kuku-formula');
    const readingP = item.querySelector('.kuku-reading');
    let revealed = false;

    function reveal() {
      if (revealed) return;
      revealed = true;
      formula.textContent = `${dan}×${i}=${dan * i}`;
      readingP.classList.remove('sr-only');
      readingP.classList.add('flash');
      setTimeout(() => readingP.classList.remove('flash'), 600);
      // 表示済みになったのでボタン性は外してもOK（任意）
      formula.removeAttribute('role');
      formula.removeAttribute('tabindex');
      formula.removeAttribute('aria-label');
    }

    formula.addEventListener('click', reveal);
    formula.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reveal(); }
    });
  });

  appEl.querySelector('#back').addEventListener('click', () => setView({ kind: 'mode-select', dan }));
}



/** ========== 画面：あんきテスト（式のみ＝答えなし） ========== */
function renderAnkiTest(dan){
  titleEl.textContent = `${dan}の段 ・ ${MODE_LABEL[MODES.ANKI_TEST]}`;
  appEl.innerHTML = `
    <section class="card">
      <div class="kuku-list">
        ${oneToNine().map(i=>`
          <div class="kuku-item">
            <!-- ここは formulaNI を使わず、答え無しの表示に固定 -->
            <div class="kuku-formula">${dan}×${i}=</div>
          </div>
        `).join('')}
      </div>
    </section>
    <div class="controls-bottom">
      <button class="btn" id="back">戻る</button>
      <button class="btn success" id="open-pass">合格</button>
    </div>
  `;
  appEl.querySelector('#back').addEventListener('click', ()=>setView({kind:'mode-select', dan}));
  appEl.querySelector('#open-pass').addEventListener('click', ()=>openPassModal(dan, MODES.ANKI_TEST));
}


/** ========== 画面：九九テスト（式のみ＝答えなし） ========== */
function renderFinalTest(dan){
  titleEl.textContent = `${dan}の段 ・ ${MODE_LABEL[MODES.FINAL_TEST]}`;

  const order = shuffle(oneToNine());
  let idx = 0;

  appEl.innerHTML = `
    <section class="card" id="final-card" role="button" tabindex="0" aria-label="数式を進める">
      <div class="kuku-item" style="text-align:center; padding:32px">
        <div id="final-formula" class="kuku-formula" style="font-size:40px">${dan}×${order[idx]}=</div>
      </div>
    </section>
    <div class="controls-bottom" id="final-controls" hidden>
      <button class="btn" id="back">戻る</button>
      <button class="btn success" id="open-pass">合格</button>
    </div>
  `;

  const card = document.getElementById('final-card');
  const label = document.getElementById('final-formula');
  const controls = document.getElementById('final-controls');

  function advance(){
    idx++;
    if(idx >= order.length){
      controls.hidden = false;
      label.textContent = `テスト終了`;
      return;
    }
    label.textContent = `${dan}×${order[idx]}=`;
    card.classList.add('flash');
    setTimeout(()=>card.classList.remove('flash'), 450);
  }

  card.addEventListener('click', advance);
  card.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); advance(); }});

  controls.querySelector('#back').addEventListener('click', ()=>setView({kind:'mode-select', dan}));
  controls.querySelector('#open-pass').addEventListener('click', ()=>openPassModal(dan, MODES.FINAL_TEST));
}


function shuffle(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }

/* ---------- 合格モーダル ---------- */
const modalBackdrop=document.getElementById('modal-backdrop');
const passInput=document.getElementById('pass-input');
const passSubmit=document.getElementById('pass-submit');
const modalCancel=document.getElementById('modal-cancel');
let modalContext={ dan:null, mode:null };

function openPassModal(dan, apiMode){
  modalContext={ dan, mode:apiMode };
  modalBackdrop.setAttribute('aria-hidden','false');
  passInput.value=''; passSubmit.disabled=true;
  setTimeout(()=>passInput.focus(),0);
  modalBackdrop.addEventListener('click', backdropCloser, { once:true });
}
function backdropCloser(e){ if(e.target===modalBackdrop){ closeModal(); } }
function closeModal(){ modalBackdrop.setAttribute('aria-hidden','true'); }

passInput.addEventListener('input', ()=>{ 
  const v = passInput.value.trim();
  passSubmit.disabled = !(v === 'ごうかく' || v === 'とりけし');
});
modalCancel.addEventListener('click', closeModal);

document.getElementById('pass-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const input = passInput.value.trim();

  const { dan, mode } = modalContext;

  if (input === 'ごうかく') {
    const res = await sendPass(dan, mode);      // localStorage版は即OK、GAS版はPOST
    if(res && res.ok){
      closeModal();
      await fetchStatus();
      setView({kind:'mode-select', dan});
    } else {
      passInput.classList.add('flash'); setTimeout(()=>passInput.classList.remove('flash'),500);
    }
    return;
  }

  if (input === 'とりけし') {
    // ▼ localStorage から取り消し
    clearLocalPass(dan, mode);
    closeModal();
    await fetchStatus();
    setView({kind:'mode-select', dan});
    return;
  }

  // どちらでもない入力 → 何もしない（仕様：エラー表示なし）
  passInput.classList.add('flash'); setTimeout(()=>passInput.classList.remove('flash'),500);
});


/* ---------- 初期化 ---------- */
setView({kind:'menu'});
fetchStatus();
