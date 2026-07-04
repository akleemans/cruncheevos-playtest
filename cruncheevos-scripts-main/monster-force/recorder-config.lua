-- Per-recording settings for record_scenario.lua. Edit `name` (and usually
-- `description`) before each recording session; the rest is per-game.
return {
    -- this recording session
    name = "my-next-scenario",
    description = "",

    -- this game
    game = "Monster Force",
    console = "GBA",              -- "GBA" | "GB" | "GBC" | "raw"

    -- optional (defaults shown)
    -- memory_domain = nil,       -- BizHawk domain, only for console = "raw"
    -- screenshots = "interval",  -- "interval" | "changes" | "off"
    -- screenshot_interval = 30,  -- frames between screenshots
    -- out_root = nil,            -- default: scenarios/ next to the script
}
