import osmtogeojson from 'osmtogeojson';
import type { FeatureCollection } from 'geojson';

export function convertOsmToGeoJson(osmData: string): FeatureCollection {
    // Check if the input looks like XML or JSON
    // OSM data can be XML or JSON (Overpass API returns JSON sometimes)
    // But standard .osm file is XML.

    let data: any;

    if (osmData.trim().startsWith('{')) {
        data = JSON.parse(osmData);
    } else {
        const parser = new DOMParser();
        data = parser.parseFromString(osmData, "text/xml");
    }

    return osmtogeojson(data) as FeatureCollection;
}
