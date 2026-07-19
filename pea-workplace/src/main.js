import './style.css';

const imageBefore = '/images/before.png';
const imageAfterVideo = '/images/step1.png';
const imageLimitMorning = '/images/limitMorning.jpg';
const imageLimitNoon = '/images/limitNoon.jpg';
const imageDataSaved = '/images/datasaved.png';
const imageMission = '/images/mission2.png';

document.querySelector('#app').innerHTML = `
  <div class="page">
    <div>
      <div id="player"></div>
    </div>

    <div class="right">
      <img
        id="rightImage"
        src="${imageBefore}"
        alt="สถานะกิจกรรม"
      >

      <div id="formSection" style="display:none;">
        <div id="inputArea">
          <p>กรอกรหัสพนักงาน</p>
          <input
            id="empId"
            type="text"
            placeholder="Employee ID"
            autocomplete="off"
          >
          <button id="submitBtn" type="button">
            ส่งข้อมูล
          </button>
        </div>

        <p id="loadingText" style="display:none;">
          กำลังบันทึกข้อมูล...
        </p>
      </div>
    </div>
  </div>
`;

const youtubeScript = document.createElement('script');
youtubeScript.src = 'https://www.youtube.com/iframe_api';
document.body.appendChild(youtubeScript);

window.onYouTubeIframeAPIReady = async function () {
  try {
    const response = await fetch('/api/video');

    if (!response.ok) {
      throw new Error(`Video API error: ${response.status}`);
    }

    const video = await response.json();
    const videoId = getYoutubeId(video.youtube_url);

    if (!videoId) {
      throw new Error('ไม่พบ YouTube Video ID');
    }

    new YT.Player('player', {
      height: '472',
      width: '840',
      videoId,
      events: {
        onStateChange: onPlayerStateChange
      }
    });
  } catch (error) {
    console.error('Cannot load video:', error);
    alert('ไม่สามารถโหลดวิดีโอได้ กรุณาลองใหม่อีกครั้ง');
  }
};

function getYoutubeId(url) {
  if (!url) return '';

  const match = String(url).match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/))([^?&/]+)/
  );

  return match ? match[1] : '';
}

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.ENDED) {
    document.getElementById('rightImage').src = imageAfterVideo;
    document.getElementById('formSection').style.display = 'block';
  }
}

async function loadMission() {
  const response = await fetch('/api/mission');

  if (!response.ok) {
    throw new Error(`Mission API error: ${response.status}`);
  }

  return response.json();
}

function showDataSaved() {
  document.getElementById('rightImage').src = imageDataSaved;
  document.getElementById('formSection').innerHTML = '';
}

function showMission(missionData) {
  const rightImage = document.getElementById('rightImage');
  const formSection = document.getElementById('formSection');

  if (
    missionData.enabled !== true ||
    !Array.isArray(missionData.missions) ||
    missionData.missions.length === 0
  ) {
    showDataSaved();
    return;
  }

  rightImage.src = imageMission;

  const mission = missionData.missions[0];

  formSection.innerHTML = `
    <div class="mission-area">
      <p class="mission-title">
        ${escapeHtml(mission.mission_name || 'ภารกิจพิเศษ')}
      </p>

      <p class="mission-detail">
        ${escapeHtml(mission.detail || 'ตอบคำถามเพื่อรับคะแนนเพิ่ม')}
      </p>

      <p class="mission-score">
        รับเพิ่ม ${Number(mission.score ?? 1)} คะแนน
      </p>

      <button id="missionBtn" type="button">
        ไปตอบคำถามเลย!
      </button>
    </div>
  `;

  const missionBtn = document.getElementById('missionBtn');

  missionBtn.addEventListener('click', () => {
    if (!mission.mission_url) {
      alert('ไม่พบลิงก์แบบทดสอบ');
      return;
    }

    window.open(
      mission.mission_url,
      '_blank',
      'noopener,noreferrer'
    );
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function showMissionOrSuccess() {
  try {
    const missionData = await loadMission();
    showMission(missionData);
  } catch (error) {
    console.error('Cannot load mission:', error);
    showDataSaved();
  }
}

document.addEventListener('click', async function (event) {
  if (event.target.id !== 'submitBtn') return;

  const empIdInput = document.getElementById('empId');
  const empId = empIdInput.value.trim();

  const inputArea = document.getElementById('inputArea');
  const loadingText = document.getElementById('loadingText');
  const submitBtn = document.getElementById('submitBtn');
  const rightImage = document.getElementById('rightImage');

  if (!empId) {
    alert('กรุณากรอก Employee ID');
    return;
  }

  submitBtn.disabled = true;
  inputArea.style.display = 'none';
  loadingText.style.display = 'block';

  try {
    const response = await fetch('/api/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        empId
      })
    });

    const data = await response.json();

    if (data.status === 'success') {
      await showMissionOrSuccess();
      return;
    }

    if (data.status === 'limitmorning') {
      rightImage.src = imageLimitMorning;
      document.getElementById('formSection').innerHTML = '';
      return;
    }

    if (data.status === 'limitnoon') {
      rightImage.src = imageLimitNoon;
      document.getElementById('formSection').innerHTML = '';
      return;
    }

    if (data.status === 'notfound') {
      alert(
        '❌ ไม่พบข้อมูลรหัสพนักงานในระบบ\nโปรดถ่ายรูป Error นี้ไว้เพื่อเป็นหลักฐานไม่ให้ท่านสูญเสียคะแนนในครั้งนี้\nและติดต่อเจ้าหน้าที่เพื่ออัปเดตข้อมูลของท่าน'
      );

      inputArea.style.display = 'block';
      loadingText.style.display = 'none';
      empIdInput.value = '';
      submitBtn.disabled = false;
      return;
    }

    alert('เกิดข้อผิดพลาด');

    inputArea.style.display = 'block';
    loadingText.style.display = 'none';
    submitBtn.disabled = false;
  } catch (error) {
    alert(`❌ ERROR: ${error.message}`);

    inputArea.style.display = 'block';
    loadingText.style.display = 'none';
    submitBtn.disabled = false;
  }
});