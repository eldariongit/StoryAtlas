document.addEventListener('DOMContentLoaded', () => {
    init();
});

async function init() {
    try {
        const configRes = await fetch('config.json');
        const config = await configRes.json();

        const overlayFiles = config.overlayFiles;
        const mapCenter = config.mapCenter;
        const mapZoom = config.mapZoom;
        const overlayActive = config.overlayActive;

        // Initialize the map
        const map = L.map('map').setView(mapCenter, mapZoom);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        let overlays = [];
        let allPOIs = [];
        let activeOverlays = new Set(overlayActive.map((active, index) => active ? index : null).filter(i => i !== null));

        // Function to calculate distance between two points (haversine formula)
        function getDistance(lat1, lon1, lat2, lon2) {
            const R = 6371; // Radius of the Earth in km
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            return R * c;
        }

        // Load overlays
        async function loadOverlays() {
            for (const file of overlayFiles) {
                try {
                    const res = await fetch(`overlays/${file}`);
                    const data = await res.json();
                    overlays.push(data);
                    allPOIs.push(...data.points.map(p => ({...p, overlay: data.name})));
                } catch (e) {
                    console.error(`Failed to load ${file}`, e);
                }
            }
            renderSidebar();
            updateNearby();
        }

        // Render sidebar
        function renderSidebar() {
            const overlaysList = document.getElementById('overlays-list');
            overlaysList.innerHTML = '';
            overlays.forEach((overlay, index) => {
                const div = document.createElement('div');
                div.className = 'overlay-item';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = `overlay-${index}`;
                checkbox.checked = activeOverlays.has(index);
                checkbox.addEventListener('change', () => toggleOverlay(index));
                const label = document.createElement('label');
                label.htmlFor = `overlay-${index}`;
                label.textContent = overlay.name;
                div.appendChild(checkbox);
                div.appendChild(label);
                overlaysList.appendChild(div);
            });
        }

        // Toggle overlay
        function toggleOverlay(index) {
            if (activeOverlays.has(index)) {
                activeOverlays.delete(index);
                // Remove markers
                map.eachLayer(layer => {
                    if (layer.options && layer.options.overlayIndex === index) {
                        map.removeLayer(layer);
                    }
                });
            } else {
                activeOverlays.add(index);
                // Add markers
                overlays[index].points.forEach(poi => {
                    const marker = L.marker([poi.latitude, poi.longitude], {overlayIndex: index}).addTo(map);
                    let popupContent = `<h4>${poi.caption}</h4><p>${poi.description}</p>`;
                    if (poi.displayTime) popupContent += `<p>Time: ${poi.displayTime}</p>`;
                    if (poi.images.length > 0) {
                        popupContent += '<p>Images:</p>';
                        poi.images.forEach(img => {
                            popupContent += `<img src="${img}" alt="${poi.caption}" style="max-width:100px;">`;
                        });
                    }
                    marker.bindPopup(popupContent);
                });
            }
        }

        // Update nearby points
        function updateNearby() {
            const center = map.getCenter();
            const zoom = map.getZoom();
            // Geographical nearby: within 50km
            const geoNearby = allPOIs.filter(poi => getDistance(center.lat, center.lng, poi.latitude, poi.longitude) < 50);
            // Chronological nearby: within 30 days of now
            const now = new Date();
            const chronoNearby = allPOIs.filter(poi => {
                if (!poi.timestamp) return false;
                const poiDate = new Date(poi.timestamp);
                const diff = Math.abs(now - poiDate);
                return diff < 30 * 24 * 60 * 60 * 1000; // 30 days
            });
            // Most recent
            const recent = allPOIs.reduce((prev, curr) => {
                const prevTime = new Date(prev.creationTime);
                const currTime = new Date(curr.creationTime);
                return currTime > prevTime ? curr : prev;
            });

            // Render nearby
            const nearbyDiv = document.getElementById('nearby-points');
            nearbyDiv.innerHTML = '';
            const geoH3 = document.createElement('h3');
            geoH3.textContent = 'Geographical Nearby';
            nearbyDiv.appendChild(geoH3);
            geoNearby.forEach(poi => {
                const div = document.createElement('div');
                div.className = 'poi-item';
                div.innerHTML = `<h4>${poi.caption}</h4><p>${poi.description}</p><p>Distance: ${getDistance(center.lat, center.lng, poi.latitude, poi.longitude).toFixed(2)} km</p>`;
                div.addEventListener('click', () => {
                    map.flyTo([poi.latitude, poi.longitude], map.getZoom());
                });
                nearbyDiv.appendChild(div);
            });
            const chronoH3 = document.createElement('h3');
            chronoH3.textContent = 'Chronological Nearby';
            nearbyDiv.appendChild(chronoH3);
            chronoNearby.forEach(poi => {
                const div = document.createElement('div');
                div.className = 'poi-item';
                div.innerHTML = `<h4>${poi.caption}</h4><p>${poi.description}</p><p>Time: ${poi.displayTime}</p>`;
                div.addEventListener('click', () => {
                    map.flyTo([poi.latitude, poi.longitude], map.getZoom());
                });
                nearbyDiv.appendChild(div);
            });

            const recentDiv = document.getElementById('recent-poi');
            recentDiv.innerHTML = `<h4>${recent.caption}</h4><p>${recent.description}</p><p>Created: ${recent.creationTime}</p>`;
            recentDiv._clickHandler = () => {
                map.flyTo([recent.latitude, recent.longitude], map.getZoom());
            };
            if (!recentDiv._hasListener) {
                recentDiv.addEventListener('click', () => recentDiv._clickHandler());
                recentDiv._hasListener = true;
            }
        }

        // Listen to map events
        map.on('moveend', updateNearby);

        // Load on start
        await loadOverlays();
    } catch (e) {
        console.error('Failed to load config', e);
    }
}