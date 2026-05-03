/** @jsxImportSource react */
import DemoSandbox from '../DemoSandbox.tsx';
import { boot } from '../../../../../examples/big-symbols/src/setup.ts';

export default function BigSymbolsDemo() {
  return (
    <DemoSandbox
      mechanic="big-symbols"
      tags={['5x4', 'big-wild', 'lines']}
      height={640}
      cheats={[]}
      boot={(host, api) => {
        api.setStatus('Ready. Press SPIN to play - every third spin lands a 2x2 BIG WILD.');
        return boot({ host, fullScreen: false, showSpeeds: false });
      }}
    />
  );
}
