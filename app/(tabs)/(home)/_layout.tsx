import { Stack } from "expo-router";
import { TabStack } from "../../../components/TabStack";

export default function HomeStack() {
  return (
    <TabStack>
      {/* The hero image is the header here. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </TabStack>
  );
}
