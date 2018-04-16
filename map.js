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
var pitch = Math.floor((Math.random() * 90) + 1);
var locations = [{
    "id": "2",
    "title": "Merced, CA",
    "description": "University of Califorina, Merced",
    "camera": {
        center: [-120.4235, 37.3665],
        zoom: 16,
        bearing: pitch,
        pitch: pitch,
        speed: .45,
        curve: 1

    }
}, {
    "id": "3",
    "title": "Davis, CA",
    "description": "University of Califorina, Davis",
    "camera": {
        center: [-121.7582, 38.5429],
        zoom: 16,
        bearing: pitch,
        pitch: pitch,
        speed: .45,
        curve: 1
    }
}, {
    "id": "1",
    "title": "Riverside, CA",
    "description": "University of Califorina, Riverside",
    "camera": {
        center: [-117.3278, 33.9729],
        zoom: 16,
        bearing: pitch,
        pitch: pitch,
        speed: .5,
        curve: 1
    }
}, {
    "id": "4",
    "title": "San Diego, CA",
    "description": "University of Califorina, San Diego",
    "camera": {
        center: [-117.2347, 32.8793],
        zoom: 16,
        bearing: pitch,
        pitch: pitch,
        speed: .5,
        curve: 1
    }
}, {
    "id": "5",
    "title": "Fresno, CA",
    "description": "Fresno State University",
    "camera": {
        center: [-119.7458, 36.8147],
        zoom: 16,
        bearing: pitch,
        pitch: pitch,
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
        var speed = 10000;
        pitch = Math.floor((Math.random() * 90) + 1);
        // Duration the slide is on screen after interaction
        window.setTimeout(function () {
            if (alternate == 0) {
                alternate = 1;
                speed = 10000;
                playback(5, index);
            }
            else {
                alternate = 0;
                index = (index + 1 === locations.length) ? 0 : index + 1;
                playback(index, index);
            }
            // Increment index

        }, speed); // After callback, show the location for 3 seconds.
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
    map.addLayer({
        "id": "points",
        "type": "symbol",
        "source": {
            "type": "geojson",
            "data": {
                "type": "FeatureCollection",
                "features": [{
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [-77.03238901390978, 38.913188059745586]
                    },
                    "properties": {
                        "title": "<p class='icon github'>Fork me on GitHub</p>",
                        "icon": "monument"
                    }
                }, {
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [-122.414, 37.776]
                    },
                    "properties": {
                        "title": "Mapbox SF",
                        "icon": "harbor"
                    }
                }]
            }
        },
        "layout": {
            "icon-image": "{icon}-15",
            "text-field": "{title}",
            "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
            "text-offset": [0, 0.6],
            "text-anchor": "top"
        }
    });


  
    // Start the playback animation for each borough
    //playback(0, 0);
});