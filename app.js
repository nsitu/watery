const API_URL = 'https://api-sine.dfo-mpo.gc.ca/api/v1/stations';
const DATA_URL = 'https://api-sine.dfo-mpo.gc.ca/api/v1/stations';

const CHART_WIDTH  = 480;
const CHART_HEIGHT = 200;
const POPUP_OPTIONS = { maxWidth: CHART_WIDTH + 40, minWidth: CHART_WIDTH + 20 };

async function fetchTimeSeries(stationId, code, from, to) {
  const url = `${DATA_URL}/${stationId}/data?time-series-code=${code}&from=${from.toISOString()}&to=${to.toISOString()}`;
  console.log(`Fetching ${code} data:`, url);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

function parseTimeSeries(data) {
  return (data || []).map(d => ({
    date: new Date(d.eventDate),
    value: +d.value
  })).sort((a, b) => a.date - b.date);
}

function renderChart(wloData, wlpData, containerEl) {
  const observed = parseTimeSeries(wloData);
  const predicted = parseTimeSeries(wlpData);

  if (observed.length === 0 && predicted.length === 0) {
    containerEl.innerHTML = '<p style="color:#888;font-size:13px;">No water level data available.</p>';
    return;
  }

  const allPoints = [...observed, ...predicted];

  const margin = { top: 16, right: 20, bottom: 30, left: 50 };
  const width = CHART_WIDTH - margin.left - margin.right;
  const height = CHART_HEIGHT - margin.top - margin.bottom;

  const svg = d3.select(containerEl)
    .append('svg')
    .attr('width', CHART_WIDTH)
    .attr('height', CHART_HEIGHT)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleTime()
    .domain(d3.extent(allPoints, d => d.date))
    .range([0, width]);

  const y = d3.scaleLinear()
    .domain(d3.extent(allPoints, d => d.value))
    .nice()
    .range([height, 0]);

  // X axis
  svg.append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(6).tickFormat(d3.timeFormat('%H:%M')))
    .selectAll('text')
    .attr('font-size', '10px');

  // Y axis
  svg.append('g')
    .call(d3.axisLeft(y).ticks(5))
    .selectAll('text')
    .attr('font-size', '10px');

  // Y label
  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('y', -margin.left + 12)
    .attr('x', -height / 2)
    .attr('text-anchor', 'middle')
    .attr('font-size', '11px')
    .attr('fill', '#666')
    .text('Water Level (m)');

  // "Now" reference line
  const now = new Date();
  if (now >= x.domain()[0] && now <= x.domain()[1]) {
    svg.append('line')
      .attr('x1', x(now)).attr('x2', x(now))
      .attr('y1', 0).attr('y2', height)
      .attr('stroke', '#ccc')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4,3');
  }

  const line = d3.line()
    .x(d => x(d.date))
    .y(d => y(d.value));

  // Observed (solid blue)
  if (observed.length > 0) {
    svg.append('path')
      .datum(observed)
      .attr('fill', 'none')
      .attr('stroke', '#2980b9')
      .attr('stroke-width', 1.5)
      .attr('d', line);
  }

  // Predicted (dashed grey)
  if (predicted.length > 0) {
    svg.append('path')
      .datum(predicted)
      .attr('fill', 'none')
      .attr('stroke', '#999')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '5,3')
      .attr('d', line);
  }

  // Legend
  const legend = svg.append('g')
    .attr('transform', `translate(${width - 140}, 0)`);

  if (observed.length > 0) {
    legend.append('line').attr('x1', 0).attr('x2', 18).attr('y1', 0).attr('y2', 0)
      .attr('stroke', '#2980b9').attr('stroke-width', 1.5);
    legend.append('text').attr('x', 22).attr('y', 4)
      .attr('font-size', '10px').attr('fill', '#333').text('Observed');
  }

  if (predicted.length > 0) {
    const yOff = observed.length > 0 ? 16 : 0;
    legend.append('line').attr('x1', 0).attr('x2', 18).attr('y1', yOff).attr('y2', yOff)
      .attr('stroke', '#999').attr('stroke-width', 1.5).attr('stroke-dasharray', '5,3');
    legend.append('text').attr('x', 22).attr('y', yOff + 4)
      .attr('font-size', '10px').attr('fill', '#333').text('Predicted');
  }
}

async function loadStations() {
  const statusEl = document.getElementById('status');
  const errorEl  = document.getElementById('error');

  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const stations = await response.json();
    console.log('stations', stations);

    const activeStations = stations.filter(s => s.operating === true);
    statusEl.textContent = `${activeStations.length} active station${activeStations.length !== 1 ? 's' : ''} found`;

    // Initialise map
    const map = L.map('map');
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18
    }).addTo(map);

    const bounds = [];

    activeStations.forEach(station => {
      const lat = station.latitude;
      const lng = station.longitude;
      if (lat == null || lng == null) return;

      bounds.push([lat, lng]);

      const tsCodes = (station.timeSeries || []).map(ts => (ts.code || '').toLowerCase());
      const hasWlo = tsCodes.includes('wlo');
      const hasWlp = tsCodes.includes('wlp');

      const stationName = station.officialName || station.name || station.id;

      const marker = L.marker([lat, lng]).addTo(map);

      // Build static popup content (title + code + chart placeholder)
      const container = document.createElement('div');
      container.className = 'popup-content';

      const title = document.createElement('strong');
      title.textContent = stationName;
      container.appendChild(title);

      if (station.code) {
        const codeEl = document.createElement('span');
        codeEl.className = 'popup-code';
        codeEl.textContent = ` (${station.code})`;
        container.appendChild(codeEl);
      }

      let chartEl = null;
      if (hasWlo) {
        chartEl = document.createElement('div');
        chartEl.className = 'wl-chart';
        container.appendChild(chartEl);
      }

      marker.bindPopup(container, POPUP_OPTIONS);

      // Fetch data lazily on popup open
      if (hasWlo) {
        marker.on('popupopen', () => {
          chartEl.innerHTML = '<p style="color:#888;font-size:12px;">Loading chart…</p>';

          const now = new Date();
          const past24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          const future24 = new Date(now.getTime() + 24 * 60 * 60 * 1000);

          const wloPromise = fetchTimeSeries(station.id, 'wlo', past24, now);
          const wlpPromise = hasWlp ? fetchTimeSeries(station.id, 'wlp', now, future24) : Promise.resolve([]);

          Promise.all([wloPromise, wlpPromise])
            .then(([wloData, wlpData]) => {
              chartEl.innerHTML = '';
              renderChart(wloData, wlpData, chartEl);
              marker.getPopup().update();
            })
            .catch(err => {
              chartEl.innerHTML = '<p style="color:#c0392b;font-size:12px;">Failed to load data.</p>';
              console.error(err);
            });
        });
      }
    });

    // Fit map to station bounds
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [30, 30] });
    } else {
      map.setView([56, -96], 4); // Fallback: center of Canada
    }

  } catch (err) {
    statusEl.textContent = 'Failed to load stations.';
    errorEl.style.display = 'block';
    errorEl.textContent   = `Error: ${err.message}`;
    console.error(err);
  }
}

loadStations();
