import './style.css';

document.querySelector('#app').innerHTML = `
  <div class="page">
    <div>
      <div id="player"></div>
    </div>

    <div class="right">
      <img 
        id="rightImage" 
        src="https://raw.githubusercontent.com/peaworkplacesolution-oss/PEA_workplace_img/main/ดูคลิปจบ กรอก ID .png"
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

window.onYouTubeIframeAPIReady = function () {
  new YT.Player('player', {
    height: '472',
    width: '840',
    videoId: 'bGjaELie1eM',
    events: {
      onStateChange: onPlayerStateChange
    }
  });
};

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.ENDED) {
    document.getElementById('formSection').style.display = 'block';
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
      rightImage.src = 'https://raw.githubusercontent.com/peaworkplacesolution-oss/PEA_workplace_img/main/บันทึกข้อมูลเรียบร้อย .png';
      document.getElementById('formSection').innerHTML = '';
    } else if (data.status === 'limitmorning') {
      rightImage.src = 'https://raw.githubusercontent.com/peaworkplacesolution-oss/PEA_workplace_img/main/errornoon.jpg';
      document.getElementById('formSection').innerHTML = '';
    } else if (data.status === 'limitnoon') {
      rightImage.src = 'https://raw.githubusercontent.com/peaworkplacesolution-oss/PEA_workplace_img/main/errormorning.jpg';
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