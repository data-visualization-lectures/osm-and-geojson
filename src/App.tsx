import { useCallback, useEffect, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import './App.css';
import { convertSvgToGeoJson } from './converters/svgToGeojson';
import { convertGeoJsonToSvg } from './converters/geojsonToSvg';
import { convertOsmToGeoJson } from './converters/osmToGeojson';


type InputType = 'svg' | 'geojson' | 'osm';
type OutputType = 'geojson' | 'svg';
type FitMode = 'width' | 'height' | 'none';

function formatSvgMeta(metadata: { pathCount: number; featureCount: number; samplePoints: number }) {
  return `Paths: ${metadata.pathCount} · Features: ${metadata.featureCount} · Samples per path: ${metadata.samplePoints}`;
}

function formatGeoMeta(metadata: { elementCount: number; bbox: { minX: number; minY: number; maxX: number; maxY: number } | null }) {
  const bboxText = metadata.bbox
    ? `Bounds: [${metadata.bbox.minX.toFixed(2)}, ${metadata.bbox.minY.toFixed(2)}] → [${metadata.bbox.maxX.toFixed(
      2
    )}, ${metadata.bbox.maxY.toFixed(2)}]`
    : 'Bounds: n/a';
  return `SVG elements: ${metadata.elementCount} · ${bboxText}`;
}

function sanitizeNumber(value: string, fallback: number) {
  if (value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function downloadText(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function App() {
  const [inputType, setInputType] = useState<InputType>('osm');
  const [outputType, setOutputType] = useState<OutputType>('geojson');

  const [autoConvert, setAutoConvert] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Inputs preserved per type
  const [svgInput, setSvgInput] = useState('');
  const [geoJsonInput, setGeoJsonInput] = useState('');
  const [osmInput, setOsmInput] = useState('');

  // Outputs
  const [outputString, setOutputString] = useState('');

  // Intermediate / Preview states
  const [previewFC, setPreviewFC] = useState<FeatureCollection | null>(null);
  const [previewSvg, setPreviewSvg] = useState<string | null>(null);

  const [metadataMessage, setMetadataMessage] = useState<string | null>(null);

  // Options: SVG Input
  const [samplePoints, setSamplePoints] = useState(250);
  const [flipY, setFlipY] = useState(true);
  const [svgPrecision, setSvgPrecision] = useState(2);

  // Options: SVG Output
  const [viewportWidth, setViewportWidth] = useState(640);
  const [viewportHeight, setViewportHeight] = useState(480);
  const [fitMode, setFitMode] = useState<FitMode>('width');
  const [pointRadius, setPointRadius] = useState(2);
  const [geoPrecision, setGeoPrecision] = useState(2);
  const [extentMode, setExtentMode] = useState<'auto' | 'custom'>('auto');
  const [extent, setExtent] = useState({
    left: -180,
    bottom: -90,
    right: 180,
    top: 90,
  });

  const inputValue = inputType === 'svg' ? svgInput : inputType === 'geojson' ? geoJsonInput : osmInput;
  const extentDisabled = extentMode === 'auto';

  const runConversion = useCallback(async () => {
    // 1. Identify valid input
    const currentInput = inputType === 'svg' ? svgInput : inputType === 'geojson' ? geoJsonInput : osmInput;
    if (!currentInput.trim()) {
      setError(null);
      setStatus(null);
      setOutputString('');
      setPreviewFC(null);
      setPreviewSvg(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    setStatus('変換・生成中...');
    setMetadataMessage(null);

    try {
      // Step 1: Convert Input to GeoJSON (FeatureCollection)
      let startMetaMsg = '';
      let fc: FeatureCollection;

      if (inputType === 'svg') {
        const result = await convertSvgToGeoJson(currentInput, {
          samplePoints,
          flipY,
          precision: svgPrecision
        });
        fc = result.collection;
        startMetaMsg = formatSvgMeta(result.metadata);
      } else if (inputType === 'osm') {
        fc = convertOsmToGeoJson(currentInput);
        startMetaMsg = `OSM Features: ${fc.features.length}`;
      } else {
        // GeoJSON
        const parsed = JSON.parse(currentInput);
        // Basic validation
        if (parsed.type === 'FeatureCollection') {
          fc = parsed;
        } else if (parsed.type === 'Feature') {
          fc = { type: 'FeatureCollection', features: [parsed] };
        } else if (Array.isArray(parsed.features)) {
          fc = { type: 'FeatureCollection', features: parsed.features };
        } else {
          // Fallback: try to treat as geometry?
          fc = { type: 'FeatureCollection', features: [] };
          // Ideally we should handle single geometry, but let's assume valid FeatureCollection or Feature for now.
        }
        startMetaMsg = `Features: ${fc.features?.length || 0}`;
      }

      setPreviewFC(fc);

      // Step 2: Convert GeoJSON to Output
      if (outputType === 'geojson') {
        const formatted = JSON.stringify(fc, null, 2);
        setOutputString(formatted);
        setPreviewSvg(null);
        setMetadataMessage(startMetaMsg);
        setStatus('GeoJSONを出力しました。');
      } else {
        // Output: SVG
        const fcStr = JSON.stringify(fc);
        const result = convertGeoJsonToSvg(fcStr, {
          viewportWidth,
          viewportHeight,
          fitTo: fitMode === 'none' ? undefined : fitMode,
          precision: geoPrecision,
          pointRadius,
          mapExtentFromGeojson: extentMode === 'auto',
          mapExtent: extentMode === 'custom' ? extent : undefined,
        });
        setOutputString(result.svg);
        setPreviewSvg(result.svg);

        // Combine metadata messages if useful, or just show SVG meta
        setMetadataMessage(formatGeoMeta(result.metadata));
        setStatus('SVGを出力しました。');
      }

    } catch (e) {
      const msg = e instanceof Error ? e.message : 'エラーが発生しました';
      setError(msg);
      setStatus(null);
    } finally {
      setIsLoading(false);
    }

  }, [
    inputType, outputType,
    svgInput, osmInput, geoJsonInput,
    samplePoints, flipY, svgPrecision, // Input opts
    viewportWidth, viewportHeight, fitMode, pointRadius, geoPrecision, extentMode, extent // Output opts
  ]);

  // Auto-run effect
  useEffect(() => {
    if (!autoConvert) return;
    const timeout = window.setTimeout(() => {
      void runConversion();
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [
    autoConvert,
    runConversion,
    // All dependencies are covered by runConversion's dependency list generally,
    // but strictly we should watch the same values.
    // We can just watch runConversion itself if it's properly memoized with all deps.
  ]);

  // When switching modes, clear error/status? Or maybe re-run?
  useEffect(() => {
    setError(null);
    setStatus(null);
  }, [inputType, outputType]);

  const updateExtent = (key: keyof typeof extent) => (value: string) => {
    setExtent((prev) => ({
      ...prev,
      [key]: sanitizeNumber(value, prev[key]),
    }));
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Type validation
    if (inputType === 'svg' && file.type !== 'image/svg+xml') {
      setError('SVGファイルを選択してください(.svg)');
      //   return; // Weak validation, allow user to try
    }
    if (inputType === 'geojson' && !file.name.includes('json')) {
      setError('GeoJSONファイルを選択してください(.json, .geojson)');
    }
    if (inputType === 'osm' && !file.name.includes('.osm') && !file.name.includes('.xml')) {
      setError('OSMファイルを選択してください(.osm, .xml)');
    }

    const text = await file.text();
    if (inputType === 'svg') setSvgInput(text);
    else if (inputType === 'geojson') setGeoJsonInput(text);
    else setOsmInput(text);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { value } = event.target;
    if (inputType === 'svg') setSvgInput(value);
    else if (inputType === 'geojson') setGeoJsonInput(value);
    else setOsmInput(value);
  };

  const handleClear = () => {
    if (inputType === 'svg') setSvgInput('');
    else if (inputType === 'geojson') setGeoJsonInput('');
    else setOsmInput('');

    setOutputString('');
    setPreviewFC(null);
    setPreviewSvg(null);
    setError(null);
    setStatus(null);
    setMetadataMessage(null);
  };

  const handleCopy = async () => {
    if (!outputString) return;
    try {
      await navigator.clipboard.writeText(outputString);
      setCopyFeedback('コピーしました');
      setTimeout(() => setCopyFeedback(null), 1800);
    } catch {
      setError('コピーに失敗しました');
    }
  };

  const handleDownload = () => {
    if (!outputString) return;
    const ext = outputType === 'geojson' ? '.geojson' : '.svg';
    const type = outputType === 'geojson' ? 'application/geo+json' : 'image/svg+xml';
    downloadText(outputString, `converted${ext}`, type);
  };

  return (
    <div className="app">
      <header className="app__header">
        <h1>OSM ⇄ GeoJSON/SVG 変換ツール</h1>
        <p>ブラウザ上で相互変換・プレビューが可能です。</p>
      </header>

      <section className="mode-toggle">
        {/* Replaced by Dropdowns in panels, but we can keep the Auto-convert toggle here or move it */}
        <div style={{ flex: 1 }} />
        <label className="mode-toggle__auto">
          <input
            type="checkbox"
            checked={autoConvert}
            onChange={(event) => setAutoConvert(event.target.checked)}
          />
          自動変換
        </label>
      </section>

      <section className="panels">
        {/* INPUT PANEL */}
        <div className="panel">
          <div className="panel__header">
            <h2>入力</h2>
            <div className="panel__controls">
              <select
                value={inputType}
                onChange={(e) => setInputType(e.target.value as InputType)}
                className="panel__select"
              >
                <option value="osm">OSM (OpenStreetMap)</option>
                <option value="svg">SVG</option>
                <option value="geojson">GeoJSON</option>
              </select>

              <label className="panel__file">
                ファイル
                <input
                  type="file"
                  accept={
                    inputType === 'svg' ? '.svg' :
                      inputType === 'geojson' ? '.json,.geojson' :
                        '.osm,.xml'
                  }
                  onChange={handleFileUpload}
                />
              </label>
              <button type="button" onClick={handleClear}>
                クリア
              </button>
            </div>
          </div>
          <textarea
            className="panel__textarea"
            value={inputValue}
            onChange={handleInputChange}
            placeholder={
              inputType === 'svg' ? '<svg>...</svg>' :
                inputType === 'geojson' ? '{ "type": "FeatureCollection", ... }' :
                  '<?xml ... <osm ...'
            }
          />
        </div>

        {/* OUTPUT PANEL */}
        <div className="panel">
          <div className="panel__header">
            <h2>出力</h2>
            <div className="panel__controls">
              <select
                value={outputType}
                onChange={(e) => setOutputType(e.target.value as OutputType)}
                className="panel__select"
              >
                <option value="geojson">GeoJSON</option>
                <option value="svg">SVG</option>
              </select>

              <button type="button" onClick={handleCopy} disabled={!outputString}>
                コピー
              </button>
              <button type="button" onClick={handleDownload} disabled={!outputString}>
                ダウンロード
              </button>
            </div>
          </div>
          <textarea
            className="panel__textarea panel__textarea--output"
            value={outputString}
            readOnly
            placeholder="ここに変換結果が表示されます"
          />
          <div className="panel__footer">
            {metadataMessage && <span>{metadataMessage}</span>}
            {copyFeedback && <span className="panel__feedback">{copyFeedback}</span>}
          </div>
        </div>
      </section>

      <section className="options">
        {/* INPUT OPTIONS (Only for SVG) */}
        {inputType === 'svg' && (
          <div className="options__group">
            <span className="options__label">SVG入力設定:</span>
            <label>
              サンプル数
              <input
                type="number"
                min={50}
                max={2000}
                value={samplePoints}
                onChange={(event) => setSamplePoints(sanitizeNumber(event.target.value, samplePoints))}
              />
            </label>
            <label>
              Y反転
              <input type="checkbox" checked={flipY} onChange={(event) => setFlipY(event.target.checked)} />
            </label>
            <label>
              精度
              <input
                type="number"
                min={0}
                max={6}
                value={svgPrecision}
                onChange={(event) => setSvgPrecision(Math.max(0, Math.min(6, Math.floor(Number(event.target.value) || svgPrecision))))}
              />
            </label>
          </div>
        )}

        {/* OUTPUT OPTIONS (Only for SVG) */}
        {outputType === 'svg' && (
          <>
            <div className="options__group">
              <span className="options__label">SVG出力設定:</span>
              <label>
                幅
                <input type="number" value={viewportWidth} onChange={(e) => setViewportWidth(sanitizeNumber(e.target.value, viewportWidth))} />
              </label>
              <label>
                高
                <input type="number" value={viewportHeight} onChange={(e) => setViewportHeight(sanitizeNumber(e.target.value, viewportHeight))} />
              </label>
              <label>
                フィット
                <select value={fitMode} onChange={(e) => setFitMode(e.target.value as FitMode)}>
                  <option value="width">幅基準</option>
                  <option value="height">高さ基準</option>
                  <option value="none">なし</option>
                </select>
              </label>
              <label>
                半径
                <input type="number" value={pointRadius} onChange={(e) => setPointRadius(sanitizeNumber(e.target.value, pointRadius))} />
              </label>
              <label>
                精度
                <input
                  type="number"
                  min={0}
                  max={6}
                  value={geoPrecision}
                  onChange={(event) => setGeoPrecision(Math.max(0, Math.min(6, Math.floor(Number(event.target.value) || geoPrecision))))}
                />
              </label>
            </div>
            <div className="options__group">
              <label className="options__toggle">
                <input type="radio" checked={extentMode === 'auto'} onChange={() => setExtentMode('auto')} />
                Auto Extent
              </label>
              <label className="options__toggle">
                <input type="radio" checked={extentMode === 'custom'} onChange={() => setExtentMode('custom')} />
                Custom Extent
              </label>
            </div>
            {!extentDisabled && (
              <div className="options__group options__group--grid">
                <label>L <input type="number" value={extent.left} onChange={(e) => updateExtent('left')(e.target.value)} /></label>
                <label>B <input type="number" value={extent.bottom} onChange={(e) => updateExtent('bottom')(e.target.value)} /></label>
                <label>R <input type="number" value={extent.right} onChange={(e) => updateExtent('right')(e.target.value)} /></label>
                <label>T <input type="number" value={extent.top} onChange={(e) => updateExtent('top')(e.target.value)} /></label>
              </div>
            )}
          </>
        )}
      </section>

      <section className="preview">
        {/* Show GeoJSON Preview if available and output is GeoJSON or we just want to debug? 
             Actually user only cares about Output Preview generally.
             But showing GeoJSON structure is useful even if outputting SVG? 
             Let's show Output-specific preview.
         */}

        {outputType === 'svg' && previewSvg && (
          <div className="preview__pane">
            <h3>SVG Preview</h3>
            <div className="preview__canvas" dangerouslySetInnerHTML={{ __html: previewSvg }} />
          </div>
        )}

        {/* Always show GeoJSON Preview? Or only if output is GeoJSON?
             The original app showed specific previews.
             If Output = GeoJSON, show GeoJSON.
         */}
        {outputType === 'geojson' && previewFC && (
          <div className="preview__pane">
            <h3>GeoJSON Preview</h3>
            <pre className="preview__pre">{JSON.stringify(previewFC, null, 2)}</pre>
          </div>
        )}
      </section>

      <footer className="status">
        {isLoading && <span className="status__item">処理中…</span>}
        {status && <span className="status__item">{status}</span>}
        {error && <span className="status__item status__item--error">{error}</span>}
        <span className="status__spacer" />
        <a className="status__link" href="https://www.dataviz.jp/" target="_blank" rel="noreferrer">DataViz.jp</a>
      </footer>
    </div>
  );
}

export default App;
