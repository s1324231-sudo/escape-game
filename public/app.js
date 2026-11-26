const select = selector => document.querySelector(selector);
const form = select('#generate');
const sampleButton = select('#sample');
const formStatus = select('#form-status');
const setup = select('#setup');
const play = select('#play');
const activeRoom = select('#active-room');
const end = select('#end');
const next = select('#next');
let payload;
let roomIndex = 0;
let sample = false;

function button(label, cssClass) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = cssClass;
  element.textContent = label;
  return element;
}

function drawProgress(escaped = false) {
  const game = payload.data[0];
  select('#room-nav').replaceChildren(...game.rooms.map((room, index) => {
    const item = document.createElement('li');
    const cleared = escaped || index < roomIndex;
    const current = index === roomIndex && !escaped;
    item.textContent = cleared ? '✓ ' + room.title : '部屋 ' + (index + 1);
    item.className = cleared ? 'cleared' : current ? 'current' : '';
    if (current) item.setAttribute('aria-current', 'step');
    return item;
  }));
}

function drawRoom() {
  const room = payload.data[0].rooms[roomIndex];
  const investigated = new Set();
  let solved = false;
  const answerStatus = select('#answer-status');
  const hint = select('#hint');
  const hintButton = select('#hint-button');
  const lastRoom = roomIndex === 2;

  drawProgress();
  select('#room-title').textContent = room.title;
  select('#scene').textContent = room.scene;
  select('#question').textContent = room.question;
  select('#instruction').hidden = false;
  answerStatus.textContent = '';
  hint.hidden = true;
  hint.textContent = room.hint;
  hintButton.textContent = 'ヒントを見る';
  hintButton.setAttribute('aria-expanded', 'false');
  hintButton.setAttribute('aria-controls', 'hint');
  hintButton.onclick = () => {
    hint.hidden = !hint.hidden;
    hintButton.textContent = hint.hidden ? 'ヒントを見る' : 'ヒントを閉じる';
    hintButton.setAttribute('aria-expanded', String(!hint.hidden));
  };
  next.hidden = true;
  next.textContent = lastRoom ? '外へ出る' : '次の部屋へ';

  const options = room.options.map((text, index) => {
    const option = button(text, 'option');
    option.disabled = true;
    option.onclick = () => {
      if (solved || investigated.size !== 2) return;
      if (index !== room.answerIndex) {
        answerStatus.textContent = '鍵は開かなかった。手がかりをもう一度見てみよう。';
        return;
      }
      solved = true;
      option.classList.add('correct');
      options.forEach(candidate => { candidate.disabled = true; });
      answerStatus.textContent = '鍵が開いた！ ' + room.explanation;
      next.hidden = false;
      next.focus();
    };
    return option;
  });
  select('#options').replaceChildren(...options);

  const itemCards = room.items.map((item, index) => {
    const card = document.createElement('article');
    const inspect = button('調べる · ' + item.name, 'investigate');
    const clue = document.createElement('p');
    clue.id = 'clue-' + index;
    clue.hidden = true;
    clue.textContent = item.clue;
    inspect.setAttribute('aria-controls', clue.id);
    inspect.setAttribute('aria-expanded', 'false');
    inspect.onclick = () => {
      clue.hidden = !clue.hidden;
      inspect.setAttribute('aria-expanded', String(!clue.hidden));
      if (!clue.hidden) investigated.add(index);
      if (!solved && investigated.size === 2) {
        options.forEach(option => { option.disabled = false; });
        select('#instruction').hidden = true;
      }
    };
    card.append(inspect, clue);
    return card;
  });
  select('#items').replaceChildren(...itemCards);
  select('#room-title').focus();
}

function startGame(data, isSample) {
  payload = data;
  sample = isSample;
  roomIndex = 0;
  setup.hidden = true;
  play.hidden = false;
  end.hidden = true;
  activeRoom.hidden = false;
  select('#source').textContent = sample ? 'サンプル' : 'AI生成';
  select('#game-title').textContent = payload.data[0].title;
  select('#prologue').textContent = payload.data[0].introduction;
  drawRoom();
  select('#game-title').focus();
}

next.onclick = () => {
  if (next.hidden) return;
  if (roomIndex < 2) {
    roomIndex += 1;
    drawRoom();
    return;
  }
  drawProgress(true);
  activeRoom.hidden = true;
  end.hidden = false;
  select('#ending').textContent = payload.data[0].ending;
  select('#json-details').open = false;
  select('#json-label').textContent = sample ? 'サンプルのJSONを見る' : 'APIレスポンスのJSONを見る';
  select('#json').textContent = JSON.stringify(payload, null, 2);
  select('#end-title').focus();
};

select('#replay').onclick = () => startGame(payload, sample);
select('#back').onclick = () => {
  play.hidden = true;
  setup.hidden = false;
  sampleButton.focus();
};
select('.brand').onclick = () => { if (!play.hidden) select('#back').click(); };
select('.text-link').onclick = () => { select('#about').open = true; };
sampleButton.onclick = () => {
  if (location.protocol !== 'file:') formStatus.textContent = '';
  startGame(sampleGame, true);
};

if (location.protocol === 'file:') {
  select('#fields').disabled = true;
  formStatus.textContent = 'このプレビューではサンプルで遊べます。AI生成にはサーバーの起動が必要です。';
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (select('#fields').disabled) return;
  const input = Object.fromEntries(new FormData(form));
  input.setting = input.setting.trim();
  if (!input.setting) {
    formStatus.textContent = '舞台を入力してください。';
    form.elements.setting.focus();
    return;
  }
  formStatus.textContent = 'AIが3部屋の謎を考えています…';
  select('#fields').disabled = true;
  sampleButton.disabled = true;
  try {
    const response = await fetch('/api/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(57_000)
    });
    // generic-webapi の返したJSONをパースし、ゲームの画面と遷移に使う。
    const data = JSON.parse(await response.text());
    if (!response.ok) {
      formStatus.textContent = data.error || 'ゲームを作れませんでした。';
      return;
    }
    if (!Array.isArray(data.data?.[0]?.rooms) || data.data[0].rooms.length !== 3) {
      throw new Error('Unexpected game data');
    }
    formStatus.textContent = '';
    startGame(data, false);
  } catch {
    formStatus.textContent = 'ゲームを受け取れませんでした。通信状況を確認して再度お試しください。';
  } finally {
    select('#fields').disabled = false;
    sampleButton.disabled = false;
  }
});
