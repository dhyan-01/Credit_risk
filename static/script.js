const form = document.getElementById('loan-form');
const submitBtn = document.getElementById('submit-btn');
const statusLine = document.getElementById('status-line');
const probabilityValue = document.getElementById('probability-value');
const needle = document.getElementById('needle');
const arcFill = document.querySelector('.arc-fill');
const stamp = document.getElementById('stamp');
const stampText = document.getElementById('stamp-text');
const caseNo = document.getElementById('case-no');

const incomeInput = document.getElementById('person_income');
const amntInput = document.getElementById('loan_amnt');
const percentIncomeInput = document.getElementById('loan_percent_income');

const ARC_LENGTH = 276; // matches stroke-dasharray in CSS

// Keep loan_percent_income in sync with income / loan amount unless
// the person edits it directly.
let percentEdited = false;
percentIncomeInput.addEventListener('input', () => { percentEdited = true; });

function recalcPercent() {
  if (percentEdited) return;
  const income = parseFloat(incomeInput.value);
  const amnt = parseFloat(amntInput.value);
  if (income > 0 && amnt >= 0) {
    percentIncomeInput.value = Math.min(amnt / income, 1).toFixed(2);
  }
}
incomeInput.addEventListener('input', recalcPercent);
amntInput.addEventListener('input', recalcPercent);
recalcPercent();

function randomCaseNo() {
  const n = Math.floor(10000 + Math.random() * 89999);
  caseNo.textContent = `Case No. ${n}`;
}
randomCaseNo();

function setGauge(probability) {
  // probability: 0..1 -> needle sweeps -90deg (left) to +90deg (right)
  const angle = -90 + probability * 180;
  needle.style.transform = `rotate(${angle}deg)`;
  const offset = ARC_LENGTH * (1 - probability);
  arcFill.style.strokeDashoffset = offset;
}

function resetGauge() {
  needle.style.transition = 'none';
  arcFill.style.transition = 'none';
  needle.style.transform = 'rotate(-90deg)';
  arcFill.style.strokeDashoffset = ARC_LENGTH;
  // force reflow so the next transition re-enables cleanly
  void needle.offsetWidth;
  needle.style.transition = '';
  arcFill.style.transition = '';
}

function animateProbabilityText(target) {
  const duration = 900;
  const start = performance.now();
  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const value = target * eased;
    probabilityValue.textContent = `${(value * 100).toFixed(1)}%`;
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function showStamp(isHighRisk) {
  stamp.setAttribute('data-state', 'idle');
  // restart animation
  void stamp.offsetWidth;
  if (isHighRisk) {
    stampText.textContent = 'HIGH RISK';
    stamp.setAttribute('data-state', 'high');
  } else {
    stampText.textContent = 'LOW RISK';
    stamp.setAttribute('data-state', 'low');
  }
}

function setStatus(message, isError) {
  statusLine.textContent = message;
  statusLine.classList.toggle('error', Boolean(isError));
}

function buildPayload(formData) {
  return {
    person_age: parseInt(formData.get('person_age'), 10),
    person_income: parseFloat(formData.get('person_income')),
    person_home_ownership: formData.get('person_home_ownership'),
    person_emp_length: parseFloat(formData.get('person_emp_length')),
    loan_intent: formData.get('loan_intent'),
    loan_grade: formData.get('loan_grade'),
    loan_amnt: parseFloat(formData.get('loan_amnt')),
    loan_int_rate: parseFloat(formData.get('loan_int_rate')),
    loan_percent_income: parseFloat(formData.get('loan_percent_income')),
    cb_person_default_on_file: formData.get('cb_person_default_on_file'),
    cb_person_cred_hist_length: parseInt(formData.get('cb_person_cred_hist_length'), 10),
  };
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!form.reportValidity()) return;

  const payload = buildPayload(new FormData(form));

  submitBtn.disabled = true;
  submitBtn.querySelector('.btn-label').textContent = 'Assessing…';
  setStatus('Sending application to the model…', false);
  stamp.setAttribute('data-state', 'idle');
  resetGauge();

  try {
    const response = await fetch('/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Server responded ${response.status}: ${text}`);
    }

    const result = await response.json();
    const probability = Number(result.probability_of_default);
    const isHighRisk = Number(result.default_prediction) === 1;

    requestAnimationFrame(() => setGauge(probability));
    animateProbabilityText(probability);
    setTimeout(() => showStamp(isHighRisk), 450);

    setStatus(
      `Model threshold: ${Number(result.threshold).toFixed(2)} — ` +
      (isHighRisk ? 'flagged for manual review.' : 'cleared at this threshold.'),
      false
    );
  } catch (err) {
    setStatus(`Could not complete assessment: ${err.message}`, true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.querySelector('.btn-label').textContent = 'Assess risk';
  }
});
