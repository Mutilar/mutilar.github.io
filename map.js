mapboxgl.accessToken = 'pk.eyJ1IjoibXV0aWxhciIsImEiOiJjamZ1bnJ3bXQzbjRqMnFzMmdzOGY1b2ZxIn0.h86IZyxf0QV4Ay3FTAaaCg';
var map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/light-v9',
    center: [-119.66, 37],
    pitch: 30,
    bearing: 50,
    zoom: 6.01

});
var title = document.getElementById('location-title');
var description = document.getElementById('location-description');
var alternate = 0;

var locations = [{
    "id": "2",
    "title": "HackMerced",
    "description": "DigestQuest",
    "camera": {
        center: [-120.4235, 37.3665],
        zoom: 16,
        pitch: 50,
        speed: .5,
        curve: 1

    }
}, {
    "id": "3",
    "title": "HackDavis",
    "description": "GISt",
    "camera": {
        center: [-121.7582, 38.5429],
        zoom: 16,
        bearing: -8.9,
        speed: .5,
        curve: 1
    }
}, {
    "id": "1",
    "title": "Citrus Hack",
    "description": "Coming soon.",
    "camera": {
        center: [-117.3278, 33.9729],
        zoom: 16,
        bearing: 25.3,
        speed: .5,
        curve: 1
    }
}, {
    "id": "4",
    "title": "SD Hacks",
    "description": "Coming soon.",
    "camera": {
        center: [-117.2347, 32.8793],
        zoom: 16,
        bearing: 36,
        speed: .5,
        curve: 1
    }
}, {
    "id": "5",
    "title": "HackFresno",
    "description": "Coming soon.",
    "camera": {
        center: [-119.7458, 36.8147],
        zoom: 16,
        bearing: 28.4,
        speed: .5,
        curve: 1

    }
}, {
    "title": "I've been around the block",
    "description": "Check out where I've competed, won awards, and made myself known.",
    "camera": {
        center: [-119.66, 37],
        zoom: 6.01,
        pitch: 30,
        bearing: 50,
        speed: .5,
        curve: 1
    }
}];

function playback(display, index) {
    title.textContent = locations[display].title;
    description.textContent = locations[display].description;
    

    // Animate the map position based on camera properties
    map.flyTo(locations[display].camera);

    map.once('moveend', function () {
        // Duration the slide is on screen after interaction
        window.setTimeout(function () {
            if (alternate == 0) {
                alternate = 1;

                playback(5, index);
            }
            else {
                alternate = 0;
                index = (index + 1 === locations.length) ? 0 : index + 1;
                playback(index, index);
            }
            // Increment index

        }, 1000); // After callback, show the location for 3 seconds.
    });
}

// Display the last title/description first
title.textContent = locations[locations.length - 1].title;
description.textContent = locations[locations.length - 1].description;

map.on('load', function () {
    // Insert the layer beneath any symbol layer.
    var layers = map.getStyle().layers;

    var labelLayerId;
    for (var i = 0; i < layers.length; i++) {
        if (layers[i].type === 'symbol' && layers[i].layout['text-field']) {
            labelLayerId = layers[i].id;
            break;
        }
    }
    map.addLayer({
        'id': '3d-buildings',
        'source': 'composite',
        'source-layer': 'building',
        'filter': ['==', 'extrude', 'true'],
        'type': 'fill-extrusion',
        'minzoom': 15,
        'paint': {
            'fill-extrusion-color': '#aaa',

            // use an 'interpolate' expression to add a smooth transition effect to the
            // buildings as the user zooms in
            'fill-extrusion-height': [
                "interpolate", ["linear"], ["zoom"],
                15, 0,
                15.05, ["get", "height"]
            ],
            'fill-extrusion-base': [
                "interpolate", ["linear"], ["zoom"],
                15, 0,
                15.05, ["get", "min_height"]
            ],
            'fill-extrusion-opacity': .6
        }
    }, labelLayerId);// Place polygon under the neighborhood labels.

    // Start the playback animation for each borough
    playback(0, 0);
});