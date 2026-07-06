import './style.css';
const imageBefore = '/images/before.png';
const imageAfterVideo = '/images/step1.jpg';
const imageSuccess = '/images/success.jpg';
const imageLimitMorning = '/images/limitMorning.jpg';
const imageLimitNoon = '/images/limitNoon.jpg';
const imageDataSaved = '/images/datasaved.png';
const imageMission = '/images/mission2.jpg';

document.querySelector('#app').innerHTML = `
  <div class="page">
    <div>
      <div id="player"></div>
    </div>

    <div class="right">
      <img 
        id="rightImage" 
        src="${imageBefore}"
      >

      <div id="formSection" style="display:none;">
        <div id="inputArea">
          <p>กรอกรหัสพนักงาน</p>
          <input id="empId" placeholder="Employee ID">
          <button id="submitBtn">ส่งข้อมูล</button>
        </div>

        <p id="loadingText" style="display:none;">กำลังบันทึกข้อมูล...</p>
      </div>
    </div>
  </div>
`;

const script = document.createElement('script');
script.src = 'https://www.youtube.com/iframe_api';
document.body.appendChild(script);

window.onYouTubeIframeAPIReady = async function () {
  const response = await fetch('/api/video');
  const video = await response.json(); new YT.Player('player', {
    height: '472',
    width: '840',
    videoId: getYoutubeId(video.youtube_url),
    events: {
      onStateChange: onPlayerStateChange
    }
  });
};

function getYoutubeId(url) {

  const reg =
    /(?:youtu\.be\/|v=)([^?&]+)/;

  const match = url.match(reg);

  return match
    ? match[1]
    : '';

}

function onPlayerStateChange(event) {

  if (event.data === YT.PlayerState.ENDED) {

    document.getElementById("rightImage").src = imageAfterVideo;

    document.getElementById("formSection").style.display = "block";
  }

}

document.addEventListener('click', async function (e) {
  if (e.target.id !== 'submitBtn') return;

  const empId = document.getElementById('empId').value.trim();
  const inputArea = document.getElementById('inputArea');
  const loadingText = document.getElementById('loadingText');
  const rightImage = document.getElementById('rightImage');

  if (!empId) {
    alert('กรุณากรอก Employee ID');
    return;
  }

  inputArea.style.display = 'none';
  loadingText.style.display = 'block';

  try {
    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empId })
    });

    const data = await res.json();

    if (data.status === 'success') {
      rightImage.src = imageDataSaved;
      document.getElementById('formSection').innerHTML = '';
    } else if (data.status === 'limitmorning') {
      rightImage.src = imageLimitMorning;
      document.getElementById('formSection').innerHTML = '';
    } else if (data.status === 'limitnoon') {
      rightImage.src = imageLimitNoon;
      document.getElementById('formSection').innerHTML = '';
    } else if (data.status === 'notfound') {
      alert('❌ ไม่พบข้อมูลรหัสพนักงานในระบบ\\nโปรดติดต่อเจ้าหน้าที่');
      inputArea.style.display = 'block';
      loadingText.style.display = 'none';
      document.getElementById('empId').value = '';
    } else {
      alert('เกิดข้อผิดพลาด');
      inputArea.style.display = 'block';
      loadingText.style.display = 'none';
    }
  } catch (err) {
    alert('❌ ERROR: ' + err.message);
    inputArea.style.display = 'block';
    loadingText.style.display = 'none';
  }
});