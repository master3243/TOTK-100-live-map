// Event listener for window load event

window.addEventListener('load', () => {
    // Initialize the map using Leaflet.js
    var map = L.map('map', {
        preferCanvas: true,
        minZoom: -7,
        maxZoom: 4,
        center: [0, 0],
        zoom: -5,
        cursor: true,
        crs: L.CRS.Simple, // Specifies that the map uses simple Cartesian coordinates
    });

    // Initialize a cursor marker
    var clickPositionMarker = L.marker();

    // Array to hold all markers
    var markers = [];

    // Initialize a boolean variable for marker creation mode
    var placeMarkerMode = false;

    // Event listener for 'click to make a marker' button
    $('#place-marker').click(function () {
        placeMarkerMode = !placeMarkerMode; // Toggle marker creation mode on button click
    });

    // Event listener for map click event
    map.on('click', function (e) {
        if (placeMarkerMode) { // Only create a marker if markerCreationMode is true
            clickPositionMarker
                .setLatLng(e.latlng) // Sets the geographical position of the marker
                .bindPopup( // Attaches a popup with the position to the marker
                    "<div class='totk-marker'>" +
                    "   <h2>Marker Positon</h2>" +
                    "   <div class='content'>" +
                    "       <div class='totk-marker-meta'>" +
                    "          <span><strong>X: </strong>" + e.latlng.lng + "</span>" + // Longitude
                    "          <span><strong>Y: </strong>" + e.latlng.lat + "</span>" + // Latitude
                    "       </div>" +
                    "   </div>" +
                    "</div>"
                )
                .openPopup() // Opens the popup
                .addTo(map); // Adds the marker to the map
            markers.push(clickPositionMarker); // Add the marker to the array
        }
    });

    // Define bounds for map
    let leftBottom = map.unproject([-6000, 5000], 0);
    let topRight = map.unproject([6000, -5000], 0);
    let bounds = new L.LatLngBounds(leftBottom, topRight);
    map.setMaxBounds(bounds);

    // Define background image layers
    let skyLayerBackgroundImage = L.imageOverlay('images/sky.jpg', bounds);
    let surfaceLayerBackgroundImage = L.imageOverlay('images/surface.jpg', bounds);
    let depthsLayerBackgroundImage = L.imageOverlay('images/depths.jpg', bounds);




    // Event listener for 'show-layer-sky' button click
    $('#show-layer-sky').click(function () {
        // Show sky layer, hide other layers
        skyLayerBackgroundImage.addTo(map);
        map.removeLayer(surfaceLayerBackgroundImage);
        map.removeLayer(depthsLayerBackgroundImage);
    });


    // Event listener for 'show-layer-surface' button click
    $('#show-layer-surface').click(function () {
        // Show surface layer, hide other layers
        map.removeLayer(skyLayerBackgroundImage);
        surfaceLayerBackgroundImage.addTo(map);
        map.removeLayer(depthsLayerBackgroundImage);
    }).trigger('click'); // Trigger the click event immediately on page load


    // Event listener for 'show-layer-depths' button click
    $('#show-layer-depths').click(function () {
        // Show depths layer, hide other layers
        map.removeLayer(skyLayerBackgroundImage);
        map.removeLayer(surfaceLayerBackgroundImage);
        depthsLayerBackgroundImage.addTo(map);

    });

    // Event listener for 'submit-coordinates' button click
    $('#submit-coordinates').click(function () {
        // Retrieve user inputs for x and y coordinates
        var x = $('#x-coordinate').val();
        var y = $('#y-coordinate').val();

            // Check if inputs are empty
        if (x === "" || y === "") {
            alert("Please enter both coordinates.");
            return;
        }

        // Convert the inputs to numbers
        var xNum = Number(x);
        var yNum = Number(y);
        console.log(xNum, yNum);

        // Check if inputs are valid numbers
        if (isNaN(xNum) || isNaN(yNum)) {
            alert("Please enter valid numbers for the coordinates.");
            return;
        }

        // Create a LatLng object for the input coordinates
        var inputCoordinates = new L.LatLng(yNum, xNum);

        // Place a marker on the map at the specified coordinates
        var inputMarker = L.marker(inputCoordinates);
        markers.push(inputMarker); // Add the marker to the array

        inputMarker.bindPopup( // Attaches a popup with the position to the marker
            "<div class='totk-marker'>" +
            "   <h2>Marker Positon</h2>" +
            "   <div class='content'>" +
            "       <div class='totk-marker-meta'>" +
            "          <span><strong>X: </strong>" + xNum + "</span>" + // Longitude
            "          <span><strong>Y: </strong>" + yNum + "</span>" + // Latitude
            "       </div>" +
            "   </div>" +
            "</div>"
        )
        .openPopup() // Opens the popup
        .addTo(map); // Adds the marker to the map
    });

    // Function to clear all markers
    function clearMarkers() {
        for (let i = 0; i < markers.length; i++) {
            map.removeLayer(markers[i]);
        }
        markers = [];
    }

    // Attach the function to a button click
    $('#clear-markers').click(clearMarkers);

    // Array to hold the grid lines
    let gridLines = [];

    // Function to clear all grid lines
    function clearGridLines() {
        for (let i = 0; i < gridLines.length; i++) {
            map.removeLayer(gridLines[i]);
        }
        gridLines = [];
    }

    // Attach the function to a button click
    $('#clear-grid').click(clearGridLines);

    // Function to draw a grid on the map
    function drawGrid(map, interval=1000) {
        // Clear the old grid lines
        clearGridLines();

        // Define the interval at which to draw grid lines
        var gridInterval = interval;

        // Get the bounds of the map
        var mapBounds = map.getBounds();
        var west = mapBounds.getWest();
        var east = mapBounds.getEast();
        var south = mapBounds.getSouth();
        var north = mapBounds.getNorth();

        // Calculate the number of horizontal and vertical lines
        var horizontalLines = Math.ceil((east - west) / gridInterval);
        var verticalLines = Math.ceil((north - south) / gridInterval);

        // Draw the horizontal lines
        for (var i = 0; i <= horizontalLines; i++) {
            var x = west + i * gridInterval;
            var horizontalLine = L.polyline([[south, x], [north, x]], {color: 'white', weight: 1}).addTo(map);
            gridLines.push(horizontalLine);
        }

        // Draw the vertical lines
        for (var j = 0; j <= verticalLines; j++) {
            var y = south + j * gridInterval;
            var verticalLine = L.polyline([[y, west], [y, east]], {color: 'white', weight: 1}).addTo(map);
            gridLines.push(verticalLine);
        }
    }

    // Event listener for 'show-grid' button click
    $('#show-grid-500').click(function () {
        // Draw the grid on the map at 500 spacing
        drawGrid(map, 500);
    });
    $('#show-grid-1000').click(function () {
        // Draw the grid on the map at 1000 spacing
        drawGrid(map, 1000);
    });

});