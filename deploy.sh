#!/bin/bash
# 部署 Edge Functions + 自動驗證
# verify_jwt 設定已寫死在 supabase/config.toml,CLI 會自動套用
# 注意:supabase/functions/ 的原始碼 2026-07-11 從線上拉回,現在 git 是唯一真相來源;
#      若懷疑線上被改過,先用 MCP get_edge_function 比對再部署
set -e
cd "$(dirname "$0")"
REF="oqyjixphmdrhcmomskth"
BASE="https://$REF.supabase.co/functions/v1"

for fn in fc-write fc-auth fc-ical; do
  supabase functions deploy "$fn" --project-ref "$REF"
done

echo ""
echo "===== 部署後驗證 ====="
FAIL=0

# fc-ical:免 JWT,必須直接回 iCal(壞掉 = 行事曆訂閱全滅)
if curl -s "$BASE/fc-ical" | head -1 | grep -q "BEGIN:VCALENDAR"; then
  echo "✅ fc-ical 正常(免 JWT 回傳 iCal)"
else
  echo "❌ fc-ical 異常:verify_jwt 可能被重置成 true,訂閱會壞掉!"
  FAIL=1
fi

# fc-write / fc-auth:免 JWT(passcode 自行驗證);被閘道擋 = verify_jwt 被重置
for fn in fc-write fc-auth; do
  RESP=$(curl -s -X POST "$BASE/$fn" -H "Content-Type: application/json" -d '{}')
  if echo "$RESP" | grep -qi "authorization header"; then
    echo "❌ $fn 被閘道擋下:verify_jwt 被重置成 true,App 寫入/登入會壞!"
    FAIL=1
  else
    echo "✅ $fn 正常(免 JWT,function 有執行:$(echo "$RESP" | head -c 40))"
  fi
done

exit $FAIL
