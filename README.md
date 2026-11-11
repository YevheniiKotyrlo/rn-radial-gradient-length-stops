# rn-radial-gradient-length-stops

React Native's radial gradient measures a length colour stop against `max(radiusX, radiusY)`, where CSS Images 4 measures it along the gradient ray, whose length is the ellipse's horizontal radius. On an ellipse taller than it is wide, every length stop lands nearer the centre than CSS puts it.

Made from React Native's reproducer template, on `react-native@0.90.0-nightly-20261111-1273ca128`. `ReproducerApp/App.tsx` centres one 100 × 300 box on a white screen with

```ts
backgroundImage: 'radial-gradient(ellipse 50px 150px at center, red 40px, blue 40px)'
```

CSS turns the red to blue 40 right of the centre and 120 below it; measured against `max(50, 150)`, the stop is 40 / 150 of the ellipse, 13.3 right of the centre and 40 below it.

## Steps

Android, with a device on adb (`ANDROID_SERIAL` picks one):

```sh
./reproduce-android.sh
```

iOS, on a Mac with an iPhone or iPad that `xcrun devicectl list devices` lists:

```sh
DEVELOPMENT_TEAM=<your team> ./reproduce-ios.sh <device identifier>
```

Each builds the app in Release, installs and launches it, takes a screenshot and runs `node measure.mjs screenshot.png`, which finds the box by its red and blue pixels and measures, in the box's own units, where the red turns blue rightwards and downwards from its centre. They exit 1 while the stop lands where `max(radiusX, radiusY)` puts it, 0 once it lands where CSS puts it, and 2 when a step fails or the stop lands elsewhere.
