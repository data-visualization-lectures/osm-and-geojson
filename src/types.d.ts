declare module 'svg-to-geojson/src/path-to-coordinates' {
  export function pathToCoords(
    path: SVGPathElement,
    scale: number,
    numPoints: number,
    translateX: number,
    translateY: number
  ): {
    path: SVGPathElement;
    coords: number[][];
  };
}

declare module 'svg-to-geojson/src/pathologize' {
  export function pathologize(svg: string): Promise<string>;
}

declare module 'osmtogeojson' {
  import { FeatureCollection } from 'geojson';
  export default function osmtogeojson(
    data: any,
    options?: {
      flatProperties?: boolean;
      uninterestingTags?: { [key: string]: boolean } | ((tags: { [key: string]: string }) => boolean);
      polygonFeatures?: any;
    }
  ): FeatureCollection;
}
