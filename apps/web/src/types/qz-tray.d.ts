declare module 'qz-tray' {
  type PrintData = {
    type?: string;
    format?: string;
    flavor?: string;
    data?: string | string[];
    options?: Record<string, unknown>;
  };

  type ConfigOptions = {
    units?: 'in' | 'cm' | 'mm';
    size?: { width?: number; height?: number };
    margins?: number | { top?: number; right?: number; bottom?: number; left?: number };
    scaleContent?: boolean;
    rasterize?: boolean;
    interpolation?: string;
    colorType?: string;
    density?: number | string;
    copies?: number;
    forceRaw?: boolean;
    encoding?: string | null;
  };

  type QzConfig = {
    print: (data: PrintData[], signature?: string, timestamp?: number) => Promise<unknown>;
  };

  const qz: {
    websocket: {
      connect: (opts?: { retries?: number; delay?: number; host?: string | string[] }) => Promise<unknown>;
      disconnect: () => Promise<unknown>;
      isActive: () => boolean;
    };
    printers: {
      find: (query?: string) => Promise<string | string[] | Array<{ name: string }>>;
    };
    configs: {
      create: (printer: string, options?: ConfigOptions) => QzConfig;
    };
    print: (config: QzConfig, data: PrintData[]) => Promise<unknown>;
    security: {
      setCertificatePromise: (
        handler: (resolve: (cert: string | null) => void, reject: (e?: unknown) => void) => void,
      ) => void;
      setSignaturePromise: (
        factory: (toSign: string) => (resolve: (sig: string) => void, reject: (e?: unknown) => void) => void,
      ) => void;
      setSignatureAlgorithm?: (alg: string) => void;
    };
    version: string;
  };

  export default qz;
}
