declare module 'imagetracerjs/imagetracer_v1.2.6.js' {
  const ImageTracer: {
    imageToSVG: (url: string, callback: (svgstr: string) => void, options?: any) => void;
    imagedataToSVG: (imgdata: ImageData, options?: any) => string;
    optionpresets: Record<string, any>;
  };
  export default ImageTracer;
}

declare module 'imagetracerjs' {
  const ImageTracer: {
    imageToSVG: (url: string, callback: (svgstr: string) => void, options?: any) => void;
    imagedataToSVG: (imgdata: ImageData, options?: any) => string;
    optionpresets: Record<string, any>;
  };
  export default ImageTracer;
}
