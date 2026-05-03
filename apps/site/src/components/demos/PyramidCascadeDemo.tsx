/** @jsxImportSource react */
import DemoSandbox from '../DemoSandbox.tsx';
import { boot } from '../../../../../examples/pyramid-cascade/src/setup.ts';

export default function PyramidCascadeDemo() {
  return (
    <DemoSandbox
      mechanic="pyramid-cascade"
      tags={['3-5-5-5-3', 'cascade', 'ways']}
      height={640}
      cheats={[]}
      boot={(host, api) => {
        api.setStatus('Diamond pyramid - ways pay, gravity refill, multiplier per cascade.');
        return boot({ host, fullScreen: false, showSpeeds: false });
      }}
    />
  );
}
