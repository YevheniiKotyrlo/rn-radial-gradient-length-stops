/**
 * One 100 × 300 box, centred on a white screen, painted by a radial gradient whose ellipse has radii 50 and 150 and
 * whose colour turns from red to blue at a length stop, 40px.
 *
 * @format
 */

import { StatusBar, StyleSheet, View } from 'react-native';

export const radialGradient = 'radial-gradient(ellipse 50px 150px at center, red 40px, blue 40px)';

function App() {
  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="white" />
      <View style={styles.box} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
  },
  box: {
    width: 100,
    height: 300,
    backgroundImage: radialGradient,
  },
});

export default App;
