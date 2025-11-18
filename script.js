/* =========================================================
   Mama Mansion – Frontend logic (live room status + reserve)
   - Pulls live availability from Apps Script (?action=rooms)
   - Renders floor plans for Buildings A/B
   - Submits form using ?action=reserve (atomic “hold”)
   - Niceties: scroll animations, tabs, section indicator
   ========================================================= */

/* =============== LIVE ROOM STATUS (from Apps Script) =============== */
const GAS_BASE = 'https://script.google.com/macros/s/AKfycbxTgo2vtunW_yueiaS9MJYQaCqwHbniDQ4RxOnEnK6ZwgGtR8OB6hLzwdhztfIrcuL1DA/exec';

let LIVE_STATUS = {};   // { 'A101': 'avail' | 'hold' | 'reserved', ... }
let LAST_STATUS_TS = '';

async function fetchLiveRooms() {
  const url = `${GAS_BASE}?action=rooms&_=${Date.now()}`;
  const res = await fetch(url, { cache: 'no-store' });
  const data = await res.json();
  LIVE_STATUS = data.rooms || {};
  LAST_STATUS_TS = data.ts || '';
}

function getRoomStatus(roomId) {
  return LIVE_STATUS[roomId] || 'avail';
}

/* ====================== FLOOR PLAN DATA ====================== */
/** Treat these tokens as fixtures (unclickable) */
const FIXTURES = new Set(['บันได', 'STAIR', 'LOBBY', 'OFFICE', '-']);

/** Grid layouts (8 cols × 2 rows per floor “strip” for simplicity) */
const LAYOUTS = {
  A: {
    1: ["A107","A108","A109","A110","A111","บันได","-","-",
        "A106","A105","A104","A103","A102","A101","-","-"],
    2: ["A209","A210","A211","A212","A213","บันได","A214","A215",
        "A208","A207","A206","A205","A204","A203","A202","A201"],
    3: ["A309","A310","A311","A312","A313","บันได","A314","A315",
        "A308","A307","A306","A305","A304","A303","A302","A301"],
    4: ["A409","A410","A411","A412","A413","บันได","A414","A415",
        "A408","A407","A406","A405","A404","A403","A402","A401"],
    5: ["A509","A510","A511","A512","A513","บันได","A514","A515",
        "A508","A507","A506","A505","A504","A503","A502","A501"]
  },
  B: {
    1: ["B108","B109","B110","B111","B112","","-","-",
        "B107","B106","B105","B104","B103","B102","B101","-"],
    2: ["B209","B210","B211","B212","B213","บันได","B214","B215",
        "B208","B207","B206","B205","B204","B203","B202","B201"],
    3: ["B309","B310","B311","B312","B313","บันได","B314","B315",
        "B308","B307","B306","B305","B304","B303","B302","B301"],
    4: ["B409","B410","B411","B412","B413","บันได","B414","B415",
        "B408","B407","B406","B405","B404","B403","B402","B401"],
    5: ["B509","B510","B511","B512","B513","บันได","B514","B515",
        "B508","B507","B506","B505","B504","B503","B502","B501"]
  }
};

/* ====================== RENDERING HELPERS ====================== */
let currentBuilding = 'A';
let currentFloor = 1;
let selectedRoom = '';

function renderGrid(building = currentBuilding, floor = currentFloor) {
  const grid = document.getElementById('floor-grid');
  const selLabel = document.getElementById('floor-selection');
  const submitBtn = document.querySelector('#reservation-form button[type="submit"]');
  const hiddenRoomInputs = document.querySelectorAll('input#room_id, input[name="room_id"]');

  if (!grid) return;
  grid.innerHTML = '';

  const layout = (LAYOUTS[building] && LAYOUTS[building][floor]) || [];

  layout.forEach((token) => {
    const div = document.createElement('div');

    // Fixtures
    if (FIXTURES.has(token) || !token) {
      div.className = 'room-cell fixture';
      div.innerHTML = `<div class="id stair-text">${token || '—'}</div>`;
      grid.appendChild(div);
      return;
    }

    // Normal rooms
    const status = getRoomStatus(token); // live status
    div.className = `room-cell ${status} ${selectedRoom === token ? 'selected' : ''}`;
    div.dataset.room = token;
    div.innerHTML = `<div class="id">${token}</div>`;

    if (status === 'avail') {
      const handleSelect = () => {
        // Clear previous selection
        grid.querySelectorAll('.room-cell.selected').forEach(el => el.classList.remove('selected'));
        div.classList.add('selected');
        selectedRoom = token;

        // write to all hidden inputs (robust)
        hiddenRoomInputs.forEach(inp => { inp.value = token; });

        // label
        if (selLabel) selLabel.textContent = `เลือกห้อง: ${token}`;

        // enable submit
        if (submitBtn) submitBtn.disabled = false;
      };
      div.addEventListener('click', handleSelect);
      div.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelect(); }
      });
      div.tabIndex = 0;
      div.setAttribute('role', 'button');
      div.setAttribute('aria-label', `ห้อง ${token}`);
    } else {
      div.style.cursor = 'not-allowed';
      div.setAttribute('aria-disabled', 'true');
    }

    grid.appendChild(div);
  });
}

/* ====================== PAGE BOOTSTRAP ====================== */
document.addEventListener('DOMContentLoaded', () => {
  /* ---- Scroll-in animation ---- */
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  document.querySelectorAll('.animate').forEach(el => io.observe(el));

  /* ---- Navbar shadow ---- */
  const navbar = document.querySelector('.navbar');
  window.addEventListener('scroll', () => {
    if (!navbar) return;
    navbar.style.boxShadow =
      window.pageYOffset > 20
        ? '0 2px 8px rgba(0,0,0,.08)'
        : '0 2px 4px rgba(0,0,0,.05)';
  });

  /* ---- Tabs (amenities / plan) ---- */
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      tabContents.forEach(c => {
        if (c.id === targetId) {
          c.classList.add('active','fade-in');
          setTimeout(() => c.classList.remove('fade-in'), 300);
        } else {
          c.classList.remove('active');
        }
      });
    });
  });

  /* ---- Section indicator (mobile) ---- */
  const indicator = document.querySelector('.section-indicator-mobile');
  if (indicator) {
    const titleMap = new Map([
      ['top','หน้าแรก'],
      ['about','เกี่ยวกับเรา'],
      ['features','สิ่งอำนวยความสะดวก'],
      ['room-types','ประเภทห้อง'],
      ['view360','360°'],
      ['location','ทำเลที่ตั้ง'],
      ['nearby-places','ใกล้อะไรบ้าง?'],
      ['gallery','แกลเลอรี่'],
      ['reservation','จองห้องพัก']
    ]);

    const targets = [];
    const hero = document.querySelector('header.hero');
    if (hero) { hero.dataset.observeId = 'top'; targets.push(hero); }
    for (const id of Array.from(titleMap.keys()).filter(k => k !== 'top')) {
      const el = document.getElementById(id);
      if (el) { el.dataset.observeId = id; targets.push(el); }
    }

    const setText = id => {
      const next = titleMap.get(id) || '';
      if (indicator.textContent !== next) indicator.textContent = next;
    };
    setText('top');

    const secObs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) setText(entry.target.dataset.observeId);
      });
    }, { rootMargin: '-45% 0 -50% 0', threshold: 0.01 });

    targets.forEach(t => secObs.observe(t));
  }

  /* ---- Floor/building switching ---- */
  const floorTabs = document.querySelectorAll('#floor-tabs button');
  floorTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      floorTabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFloor = parseInt(btn.dataset.floor, 10);
      selectedRoom = '';
      document.querySelectorAll('input#room_id, input[name="room_id"]').forEach(inp => inp.value = '');
      const selLabel = document.getElementById('floor-selection');
      if (selLabel) selLabel.textContent = 'ยังไม่ได้เลือกห้อง';
      const submitBtn = document.querySelector('#reservation-form button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      renderGrid();
    });
  });

  const buildingTabs = document.querySelectorAll('#building-tabs button');
  buildingTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      buildingTabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentBuilding = btn.dataset.b;
      selectedRoom = '';
      document.querySelectorAll('input#room_id, input[name="room_id"]').forEach(inp => inp.value = '');
      const selLabel = document.getElementById('floor-selection');
      if (selLabel) selLabel.textContent = 'ยังไม่ได้เลือกห้อง';
      const submitBtn = document.querySelector('#reservation-form button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      renderGrid();
    });
  });

  /* ---- Parking options toggle ---- */
  const parkingCheckbox = document.getElementById('parking-checkbox');
  const parkingPlans = document.getElementById('parking-plans');
  const parkingPlanRadios = parkingPlans ? Array.from(parkingPlans.querySelectorAll('input[name="parking_plan"]')) : [];
  const parkingPlanOptions = parkingPlans ? Array.from(parkingPlans.querySelectorAll('.parking-plan-option')) : [];
  const planAvailabilityEls = {
    roofed: document.getElementById('parking-roofed-availability'),
    open: document.getElementById('parking-open-availability')
  };
  const parkingCheckboxWrapper = parkingCheckbox ? parkingCheckbox.closest('.parking-option') : null;
  const numberFormatter = new Intl.NumberFormat('th-TH');
  let lastParkingSnapshot = '';

  const refreshParkingCards = () => {
    parkingPlanOptions.forEach(option => {
      const radio = option.querySelector('input[type="radio"]');
      option.classList.toggle('selected', !!(radio && radio.checked));
    });
  };

  const closeParkingPlans = () => {
    if (!parkingPlans) return;
    parkingPlans.classList.remove('open');
    parkingPlans.setAttribute('aria-hidden', 'true');
    parkingPlanRadios.forEach(radio => { radio.checked = false; });
    refreshParkingCards();
  };

  const openParkingPlans = () => {
    if (!parkingPlans) return;
    parkingPlans.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => parkingPlans.classList.add('open'));
    refreshParkingCards();
  };

  const handleParkingToggle = () => {
    if (!parkingPlans) return;
    if (parkingCheckbox && parkingCheckbox.checked) {
      openParkingPlans();
    } else {
      closeParkingPlans();
    }
  };

  if (parkingCheckbox && parkingPlans) {
    parkingCheckbox.addEventListener('change', handleParkingToggle);
    parkingPlanRadios.forEach(radio => radio.addEventListener('change', refreshParkingCards));
    handleParkingToggle();
  }

  const formatNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? numberFormatter.format(num) : '--';
  };

  const setPlanDisabledState = (plan, disabled) => {
    const radio = document.getElementById(`parking-plan-${plan}`);
    if (radio) {
      radio.disabled = disabled;
      if (disabled && radio.checked) {
        radio.checked = false;
        refreshParkingCards();
      }
      const option = radio.closest('.parking-plan-option');
      if (option) option.classList.toggle('plan-disabled', disabled);
    }
  };

  const updateParkingAvailabilityUI = (parking) => {
    if (!parking) return;

    ['roofed', 'open'].forEach(plan => {
      const data = parking[plan] || {};
      const capacity = Number(data.capacity ?? 0);
      const used = Number(data.used ?? 0);
      const left = Number(data.left ?? data.remaining ?? (capacity - used));

      if (planAvailabilityEls[plan]) {
        planAvailabilityEls[plan].textContent = left <= 0
          ? `เต็มแล้ว (ทั้งหมด ${formatNumber(capacity)} คัน)`
          : `เหลือ ${formatNumber(left)} จาก ${formatNumber(capacity)} คัน`;
      }

      setPlanDisabledState(plan, left <= 0);
    });

    if (parkingCheckbox) {
      const roofedLeft = Number(parking.roofed?.left ?? parking.roofed?.remaining ?? 0);
      const openLeft = Number(parking.open?.left ?? parking.open?.remaining ?? 0);
      const anyAvailable = roofedLeft > 0 || openLeft > 0;
      parkingCheckbox.disabled = !anyAvailable;
      if (parkingCheckboxWrapper) parkingCheckboxWrapper.classList.toggle('plan-disabled', !anyAvailable);
      if (!anyAvailable) {
        parkingCheckbox.checked = false;
        closeParkingPlans();
      }
    }

    lastParkingSnapshot = JSON.stringify(parking);
  };

  const fetchParkingAvailability = async () => {
    try {
      const res = await fetch(`${GAS_BASE}?action=parking&_=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data || !data.parking) throw new Error('Missing parking payload');
      const snapshot = JSON.stringify(data.parking);
      if (snapshot !== lastParkingSnapshot) {
        updateParkingAvailabilityUI(data.parking);
      }
    } catch (err) {
      console.error('Parking availability error:', err);
      Object.values(planAvailabilityEls).forEach(el => {
        if (el) el.textContent = 'ข้อมูลที่จอดไม่พร้อมใช้งาน';
      });
    }
  };

  /* ---- Reservation form submit (atomic reserve) ---- */
  const form = document.getElementById('reservation-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // must have a chosen room
      const chosen = (document.querySelector('input#room_id, input[name="room_id"]') || {}).value || '';
      if (!chosen) {
        alert('กรุณาเลือกห้องจากผัง ก่อนส่งฟอร์ม');
        return;
      }

      const wantsParking = parkingCheckbox && parkingCheckbox.checked;
      const selectedParkingPlan = wantsParking ? form.querySelector('input[name="parking_plan"]:checked') : null;
      if (wantsParking && !selectedParkingPlan) {
        alert('กรุณาเลือกแพ็กเกจที่จอดรถ');
        return;
      }

      // build params
      const fd = new FormData(form);
      fd.set('room_id', chosen);
      fd.set('action', 'reserve'); // atomic “hold” + append row

      if (wantsParking) {
        fd.set('parking', 'yes');
        fd.set('parking_plan', selectedParkingPlan ? selectedParkingPlan.value : '');
      } else {
        fd.set('parking', 'no');
        fd.delete('parking_plan');
      }

      const params = new URLSearchParams();
      fd.forEach((v, k) => params.append(k, v));

      // button feedback
      const submitBtn = form.querySelector('button[type="submit"]');
      const originalLabel = submitBtn ? submitBtn.innerHTML : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span> กำลังส่ง...';
      }

      try {
        const res = await fetch(`${GAS_BASE}?${params.toString()}`, { cache: 'no-store' });
        const text = (await res.text()).trim();

        if (text === 'ROOM_TAKEN') {
          // refresh availability + tell user to pick another room
          await fetchLiveRooms();
          try { await fetchParkingAvailability(); } catch (_) {}
          renderGrid();
          alert('ขออภัย ห้องนี้ถูกจองไปแล้ว กรุณาเลือกห้องอื่น');
          if (submitBtn) {
            submitBtn.innerHTML = originalLabel || 'ส่งคำขอจอง';
            submitBtn.disabled = false;
          }
          return;
        }

        // success → text is "#MM###"
        localStorage.setItem('reservationCode', text);
        try { await fetchParkingAvailability(); } catch (_) {}
        if (submitBtn) submitBtn.innerHTML = 'ส่งสำเร็จ ✓';
        setTimeout(() => { window.location.href = 'policy.html'; }, 800);
      } catch (err) {
        console.error(err);
        alert('ไม่สามารถส่งการจองได้ กรุณาลองอีกครั้ง');
        if (submitBtn) {
          submitBtn.innerHTML = originalLabel || 'ส่งคำขอจอง';
          submitBtn.disabled = false;
        }
      }
    });
  }

  /* ---- Initial load: fetch live + render ---- */
  (async () => {
    try {
      await fetchLiveRooms();
    } catch (_) { /* ignore; default is all avail */ }
    try {
      await fetchParkingAvailability();
    } catch (_) { /* handled in helper */ }
    renderGrid();

    // Optional: auto-refresh availability every 30s
    setInterval(async () => {
      const before = JSON.stringify(LIVE_STATUS);
      try {
        await fetchLiveRooms();
      } catch (_) { return; }
      if (JSON.stringify(LIVE_STATUS) !== before) {
        // If the selected room turned unavailable, clear selection.
        if (selectedRoom && getRoomStatus(selectedRoom) !== 'avail') {
          selectedRoom = '';
          document.querySelectorAll('input#room_id, input[name="room_id"]').forEach(inp => inp.value = '');
          const selLabel = document.getElementById('floor-selection');
          if (selLabel) selLabel.textContent = 'ยังไม่ได้เลือกห้อง';
          const submitBtn = document.querySelector('#reservation-form button[type="submit"]');
          if (submitBtn) submitBtn.disabled = true;
        }
        renderGrid();
      }
      try {
        await fetchParkingAvailability();
      } catch (_) { /* ignore */ }
    }, 30000);
  })();
});

// Floor-plan viewer
(() => {
  // Change EXT_PRIMARY to 'png' if you exported PNGs
  const BASE = 'images/floorplans';
  const EXT_PRIMARY = 'webp';
  const EXT_FALLBACK = 'png';

  const imgEl  = document.getElementById('fpv-image');
  const capEl  = document.getElementById('fpv-caption');
  const dlEl   = document.getElementById('fpv-download');
  const bBtns  = document.querySelectorAll('.fpv-buildings button');
  const fBtns  = document.querySelectorAll('.fpv-floors button');

  let state = { b:'A', f:1 };
  const path = (ext) => `${BASE}/${state.b}-${state.f}.${ext}`;

  function render(){
    imgEl.src = path(EXT_PRIMARY);
    imgEl.alt = `แปลนห้องพัก ตึก ${state.b} ชั้น ${state.f}`;
    dlEl.href = imgEl.src;
    capEl.textContent = `ตึก ${state.b} · ชั้น ${state.f}`;
  }

  // Fallback if webp missing
  imgEl.addEventListener('error', () => {
    if (imgEl.src.endsWith(`.${EXT_PRIMARY}`)) {
      imgEl.src = path(EXT_FALLBACK);
      dlEl.href = imgEl.src;
    }
  });

  // Building buttons
  bBtns.forEach(btn => btn.addEventListener('click', () => {
    state.b = btn.dataset.b;
    bBtns.forEach(b => b.classList.toggle('active', b===btn));
    render();
  }));

  // Floor buttons
  fBtns.forEach(btn => btn.addEventListener('click', () => {
    state.f = +btn.dataset.floor;
    fBtns.forEach(b => b.classList.toggle('active', b===btn));
    render();
  }));

  render();
})();
