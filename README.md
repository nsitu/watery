# watery

A single-page web app that fetches the list of water level monitoring stations
from the [Canadian Hydrographic Service](https://www.tides.gc.ca/) and displays
them in a colour-coded list:

- **Green** – station is currently active (`operating: true`)
- **Gray** – station is inactive / discontinued

## Usage

Open `index.html` in a browser (or serve it from any static HTTP server).

The page calls the CHS Integrated Water Level System (IWLS) API:

```
GET https://api-sine.dfo-mpo.gc.ca/api/v1/stations
```

API documentation: <https://api-sine.dfo-mpo.gc.ca/swagger-ui/index.html>

## Tutorial

There's a tutorial / "making-of" available for this project, here: [https://www.figma.com/community/file/1608946133401443025](https://www.figma.com/community/file/1608946133401443025)
