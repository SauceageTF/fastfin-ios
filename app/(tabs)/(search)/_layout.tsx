import { Stack } from "expo-router";
import { TabStack } from "../../../components/TabStack";

export default function SearchStack() {
  return (
    <TabStack>
      <Stack.Screen name="search" options={{ title: "Search" }} />
    </TabStack>
  );
}
