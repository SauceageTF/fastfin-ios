import { Stack } from "expo-router";
import { TabStack } from "../../../components/TabStack";

export default function LibraryStack() {
  return (
    <TabStack>
      <Stack.Screen name="library" options={{ title: "Library" }} />
    </TabStack>
  );
}
