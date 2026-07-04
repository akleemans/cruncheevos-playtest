-- record_scenario.lua - BizHawk Test Scenario recorder for rcheevos-js
--
-- Records watched memory addresses to scenarios/<name>/recording.txt and
-- captures screenshots, in the format understood by src/scenario-format.js
-- and the Scenario Viewer (tools/viewer).
--
-- Usage:
--   1. adjust the SCENARIO block and OUT_ROOT below
--   2. generate watchlist.lua (required) from your code notes:
--        node tools/notes-to-watchlist.js lua-script/5260-Notes.json > lua-script/watchlist.lua
--      and verify coverage with: npm run check-watchlist
--   3. load this script in BizHawk's Lua Console, play the scenario,
--      then stop the script - the final frame is flushed on exit
--
-- Sparse line format: header "frame,0x0770:u8,0x35a4:u32,..." names the
-- watched addresses; the first data row is a full snapshot; later rows list
-- only the cells that changed ("9203,0x359c=4380"); a bare frame number
-- marks the recording end. Unlisted cells hold their previous value, which
-- reproduces the exact per-frame sequence when expanded - Delta operands
-- and hit counting depend on that. Every line is flushed immediately, so a
-- crash costs at most one torn line.

-- ======================= configuration =======================

local SCENARIO = {
    name = "cemetery1-regular-finish",
    description = "Level 1 finish without cheats",
    game = "Monster Force",
}

-- Where scenario folders are created. Relative paths are resolved against
-- BizHawk's working directory; an absolute path to your repo is safest, e.g.
-- "/home/adrianus/Desktop/rcheevos-js/scenarios"
local OUT_ROOT = "scenarios"

-- Console the code-note addresses belong to. RetroAchievements addresses
-- are NOT System Bus addresses on most consoles - they follow the RA memory
-- map (rcheevos consoleinfo.c) and must be translated to a BizHawk domain:
--   "GBA"   0x0000-0x7FFF -> IWRAM, 0x8000-0x47FFF -> EWRAM, rest -> SRAM
--   "GB"    RA address == Game Boy bus address        -> System Bus
--   "raw"   no translation; reads MEMORY_DOMAIN (or the console default)
local CONSOLE = "GBA"

-- Only used with CONSOLE = "raw".
local MEMORY_DOMAIN = nil

-- Screenshots: "interval" (every SCREENSHOT_INTERVAL frames), "changes"
-- (every recorded row - avoid when watching per-frame counters like timers),
-- or "off".
local SCREENSHOTS = "interval"
local SCREENSHOT_INTERVAL = 30

-- Watched addresses come exclusively from this file next to the script,
-- generated from the code notes (the single source of truth for what to
-- record). Entries: { address = 0x0770, size = "u8"|"u16"|"u32", label = "" }.
local WATCHLIST_FILE = "watchlist.lua"

-- ======================= implementation =======================

-- look for the watchlist next to this script first (BizHawk's working
-- directory is usually the emulator folder, not the script folder)
local scriptDir = (debug.getinfo(1, "S").source:match("@?(.*[/\\])")) or ""
local WATCH = nil
for _, path in ipairs({ scriptDir .. WATCHLIST_FILE, WATCHLIST_FILE }) do
    local ok, result = pcall(dofile, path)
    if ok and type(result) == "table" and #result > 0 then
        WATCH = result
        print("using watchlist from " .. path .. " (" .. #result .. " addresses)")
        break
    end
end
if not WATCH then
    error("\n" .. WATCHLIST_FILE .. " not found next to record_scenario.lua (or it is empty).\n" ..
          "Generate it from your code notes:\n" ..
          "  node tools/notes-to-watchlist.js lua-script/<gameid>-Notes.json > lua-script/watchlist.lua\n" ..
          "then verify coverage with: npm run check-watchlist")
end

-- translate an RA address to a BizHawk {domain, offset} pair
local function translate(raAddress)
    if CONSOLE == "GBA" then
        if raAddress < 0x8000 then
            return "IWRAM", raAddress
        elseif raAddress < 0x48000 then
            return "EWRAM", raAddress - 0x8000
        else
            return "SRAM", raAddress - 0x48000
        end
    elseif CONSOLE == "GB" or CONSOLE == "GBC" then
        return "System Bus", raAddress
    else -- "raw"
        return MEMORY_DOMAIN, raAddress
    end
end

local READERS = {
    u8 = memory.read_u8,
    u16 = memory.read_u16_le,
    u32 = memory.read_u32_le,
}

-- pre-resolve one reader closure per watch entry
local readerFor = {}
for i, entry in ipairs(WATCH) do
    local domain, offset = translate(entry.address)
    local read = READERS[entry.size]
    if domain then
        readerFor[i] = function() return read(offset, domain) end
    else
        readerFor[i] = function() return read(offset) end
    end
end

local outDir = OUT_ROOT .. "/" .. SCENARIO.name
local shotsDir = outDir .. "/screenshots"

local function ensure_dir(path)
    -- try both unix and windows mkdir; errors are harmless if it exists
    os.execute('mkdir -p "' .. path .. '" 2>/dev/null')
    os.execute('mkdir "' .. path:gsub("/", "\\") .. '" >nul 2>nul')
end

ensure_dir(outDir)
if SCREENSHOTS ~= "off" then ensure_dir(shotsDir) end

local function json_escape(s)
    return (s:gsub('[\\"]', '\\%0'):gsub('\n', '\\n'):gsub('\r', ''))
end

local function write_meta(firstFrame)
    local f = assert(io.open(outDir .. "/meta.json", "w"))
    f:write('{\n')
    f:write('  "name": "' .. json_escape(SCENARIO.name) .. '",\n')
    f:write('  "description": "' .. json_escape(SCENARIO.description) .. '",\n')
    f:write('  "game": "' .. json_escape(SCENARIO.game) .. '",\n')
    f:write('  "console": "' .. json_escape(CONSOLE) .. '",\n')
    f:write('  "firstFrame": ' .. firstFrame .. ',\n')
    f:write('  "markers": {},\n')
    f:write('  "addresses": [\n')
    for i, entry in ipairs(WATCH) do
        f:write(string.format('    { "address": "0x%04x", "size": "%s", "label": "%s" }%s\n',
            entry.address, entry.size, json_escape(entry.label or ""),
            i < #WATCH and "," or ""))
    end
    f:write('  ]\n}\n')
    f:close()
end

local out = assert(io.open(outDir .. "/recording.txt", "w"))

local header = "frame"
local addressOf = {}
for i, entry in ipairs(WATCH) do
    addressOf[i] = string.format("0x%04x", entry.address)
    header = header .. string.format(",%s:%s", addressOf[i], entry.size)
end
out:write(header .. "\n")
out:flush()

local function read_all()
    local values = {}
    for i = 1, #WATCH do
        values[i] = readerFor[i]()
    end
    return values
end

-- sanity check: print the first reads so a wrong domain/console setting is
-- obvious immediately instead of after a whole recording session
do
    local values = read_all()
    print("first reads (check these against the RAM watch!):")
    for i = 1, math.min(#WATCH, 8) do
        print(string.format("  0x%04x %-32s = %d", WATCH[i].address,
            WATCH[i].label or "", values[i]))
    end
end

-- write one sparse row: the frame number plus only the cells that changed
-- since `previous` (all cells when previous is nil - the initial snapshot).
-- flushed per line, so a crash loses at most one torn line.
local function write_row(frame, values, previous)
    local cells = {}
    for i = 1, #values do
        if previous == nil or previous[i] ~= values[i] then
            cells[#cells + 1] = addressOf[i] .. "=" .. values[i]
        end
    end
    if previous ~= nil and #cells == 0 then
        return false -- nothing changed
    end
    out:write(frame .. (#cells > 0 and ("," .. table.concat(cells, ",")) or "") .. "\n")
    out:flush()
    return true
end

local previous = nil
local lastFrame = nil
local rowsWritten = 0
local shotsTaken = 0

local function screenshot(frame)
    client.screenshot(shotsDir .. "/" .. frame .. ".png")
    shotsTaken = shotsTaken + 1
end

event.onexit(function()
    -- bare final line marks the last recorded frame, so the expansion knows
    -- the scenario length
    if lastFrame ~= nil then
        out:write(lastFrame .. "\n")
    end
    out:close()
    print(string.format("scenario '%s': %d rows, %d screenshots -> %s",
        SCENARIO.name, rowsWritten, shotsTaken, outDir))
end)

print("recording scenario '" .. SCENARIO.name .. "' - stop the script to finish")

local firstFrame = nil

while true do
    local frame = emu.framecount()
    local values = read_all()

    if firstFrame == nil then
        firstFrame = frame
        write_meta(firstFrame)
    end

    if write_row(frame, values, previous) then
        rowsWritten = rowsWritten + 1
        if SCREENSHOTS == "changes" then screenshot(frame) end
    end

    if SCREENSHOTS == "interval" and (frame - firstFrame) % SCREENSHOT_INTERVAL == 0 then
        screenshot(frame)
    end

    previous = values
    lastFrame = frame

    emu.frameadvance()
end
