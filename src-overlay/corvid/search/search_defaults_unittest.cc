// Covers patches/debrand/0196 (no Google, DuckDuckGo first) and 0197 (no Gemini / AI Mode starter-pack entries).
#include <memory>
#include <vector>

#include "base/memory/raw_ptr.h"
#include "components/search_engines/template_url_data.h"
#include "components/search_engines/template_url_prepopulate_data.h"
#include "components/search_engines/template_url_starter_pack_data.h"
#include "components/sync_preferences/testing_pref_service_syncable.h"
#include "testing/gtest/include/gtest/gtest.h"
#include "third_party/search_engines_data/resources/definitions/prepopulated_engines.h"

namespace {

using TemplateURLPrepopulateData::PrepopulatedEngine;
using template_url_starter_pack_data::StarterPackId;

std::vector<std::unique_ptr<TemplateURLData>> Resolve(
    const std::vector<raw_ptr<const PrepopulatedEngine>>& regional) {
  sync_preferences::TestingPrefServiceSyncable prefs;
  TemplateURLPrepopulateData::RegisterProfilePrefs(prefs.registry());
  return TemplateURLPrepopulateData::GetPrepopulatedEngines(prefs, regional);
}

TEST(CorvidSearchDefaults, GoogleDroppedAndDuckDuckGoFirst) {
  auto engines = Resolve({&TemplateURLPrepopulateData::google,
                          &TemplateURLPrepopulateData::bing,
                          &TemplateURLPrepopulateData::duckduckgo});
  ASSERT_EQ(2u, engines.size());
  EXPECT_EQ(TemplateURLPrepopulateData::duckduckgo.id,
            engines[0]->prepopulate_id);
  EXPECT_EQ(TemplateURLPrepopulateData::bing.id, engines[1]->prepopulate_id);
  for (const auto& engine : engines) {
    EXPECT_NE(TemplateURLPrepopulateData::google.id, engine->prepopulate_id);
  }
}

// Documents the shortcut in 0196: without DuckDuckGo in the list the first remaining engine is the default.
TEST(CorvidSearchDefaults, NoDuckDuckGoKeepsOrderWithoutGoogle) {
  auto engines = Resolve({&TemplateURLPrepopulateData::google,
                          &TemplateURLPrepopulateData::bing});
  ASSERT_EQ(1u, engines.size());
  EXPECT_EQ(TemplateURLPrepopulateData::bing.id, engines[0]->prepopulate_id);
}

TEST(CorvidSearchDefaults, StarterPackHasNoGeminiOrAiMode) {
  auto engines = template_url_starter_pack_data::GetStarterPackEngines();
  EXPECT_EQ(4u, engines.size());  // bookmarks, history, tabs, page
  for (const auto& engine : engines) {
    EXPECT_NE(static_cast<int>(StarterPackId::kGemini),
              engine->starter_pack_id);
    EXPECT_NE(static_cast<int>(StarterPackId::kAiMode),
              engine->starter_pack_id);
  }
}

}  // namespace
