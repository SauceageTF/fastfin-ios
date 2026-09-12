import { Stack } from "expo-router";
import { TabStack } from "../../../components/TabStack";

export default function SettingsStack() {
  return (
    <TabStack>
      <Stack.Screen name="settings" options={{ title: "Settings" }} />
    </TabStack>
  );
}
