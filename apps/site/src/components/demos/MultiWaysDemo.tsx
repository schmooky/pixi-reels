/** @jsxImportSource react */
import DemoSandbox from '../DemoSandbox.tsx';
import { boot } from '../../../../../examples/multiways/src/setup.ts';

export default function MultiWaysDemo() {
  return (
    <DemoSandbox
      mechanic="multiways"
      tags={['6 reels', 'megaways', 'multiways']}
      height={640}
      cheats={[]}
      boot={(host, api) => {
        api.setStatus('Each spin rolls a fresh per-reel shape. Ways = product of row counts.');
        return boot({ host, fullScreen: false, showSpeeds: false });
      }}
    />
  );
}
