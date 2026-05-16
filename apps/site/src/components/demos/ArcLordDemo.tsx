/** @jsxImportSource react */
import DemoSandbox from '../DemoSandbox.tsx';
import { boot } from '../../../../../examples/arc-lord/src/setup.ts';

export default function ArcLordDemo() {
  return (
    <DemoSandbox
      mechanic="arc-lord"
      tags={['6x5', 'tumble', 'spine', 'zvuk', 'audio']}
      height={640}
      cheats={[]}
      boot={(host, api) => {
        api.setStatus('Click SPIN — unlocks audio on the first click.');
        return boot({ host, fullScreen: false });
      }}
    />
  );
}
