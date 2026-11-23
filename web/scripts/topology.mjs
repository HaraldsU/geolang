// Builds the map's TopoJSON for the data pipeline (pipeline/geolang/borders.py).
// stdin: {"objects": {name: GeoJSON FeatureCollection}, "quantization": number}
// stdout: TopoJSON in which all objects share arcs, so they simplify identically in the browser.
import { topology } from 'topojson-server';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const { objects, quantization } = JSON.parse(input);
process.stdout.write(JSON.stringify(topology(objects, quantization)));
