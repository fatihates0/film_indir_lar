#!/bin/bash
# ==============================================================================
# Storage Box MKV Görüntü ve Ses Başlığı Güncelleme Betiği (TSI) - v2.0
# ==============================================================================
# Seçilen Storage Box veya dizindeki tüm .mkv dosyalarını tarar,
# görüntü ve ses izlerinin başlıklarını "TSI" yapar (dillerini DEĞİŞTİRMEZ).
# ==============================================================================

# Shell renklendirmeleri
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # Renksiz

# Gerekli paketleri kontrol et ve kur (mkvtoolnix)
if ! command -v mkvpropedit &>/dev/null || ! command -v mkvmerge &>/dev/null; then
    echo -e "${YELLOW}[BİLGİ] Sunucuda 'mkvtoolnix' (mkvpropedit) paketi eksik. Otomatik yükleniyor...${NC}"
    if command -v apt-get &>/dev/null; then
        apt-get update -qq && apt-get install -y -qq mkvtoolnix python3
    elif command -v yum &>/dev/null; then
        yum install -y mkvtoolnix python3
    else
        echo -e "${RED}[HATA] mkvtoolnix otomatik yüklenemedi. Lütfen 'apt install mkvtoolnix' komutu ile kurun.${NC}"
        exit 1
    fi
fi

# Storage Box mount noktalarını tespit et
get_storageboxes() {
    MOUNT_LIST=()

    # 1. /etc/fstab kayıtlarından bul
    if [ -f /etc/fstab ]; then
        while read -r line; do
            mp=$(echo "$line" | awk '{print $2}')
            if [ -n "$mp" ] && [ -d "$mp" ]; then
                MOUNT_LIST+=("$mp")
            fi
        done < <(grep -E 'cifs|storagebox' /etc/fstab | grep -v '^#')
    fi

    # 2. Standart /mnt dizinlerinden bul
    if [ -d /mnt/storagebox ]; then
        MOUNT_LIST+=("/mnt/storagebox")
    fi
    if [ -d /mnt/storageboxes ]; then
        for dir in /mnt/storageboxes/*; do
            if [ -d "$dir" ]; then
                MOUNT_LIST+=("$dir")
            fi
        done
    fi

    # 3. Aktif cifs mountlarından bul
    if command -v mount &>/dev/null; then
        while read -r mp; do
            if [ -n "$mp" ] && [ -d "$mp" ]; then
                MOUNT_LIST+=("$mp")
            fi
        done < <(mount -t cifs 2>/dev/null | awk '{print $3}')
    fi

    # Mükerrer olanları temizle
    UNIQUE_MOUNTS=()
    if [ ${#MOUNT_LIST[@]} -gt 0 ]; then
        while IFS= read -r entry; do
            [ -n "$entry" ] && UNIQUE_MOUNTS+=("$entry")
        done < <(printf "%s\n" "${MOUNT_LIST[@]}" | sort -u)
    fi
}

# MKV dosyasındaki görüntü ve ses izlerinin track numaralarını tespit et (properties.number)
get_video_audio_track_numbers() {
    local file="$1"
    local nums=()

    if command -v python3 &>/dev/null; then
        while IFS= read -r line; do
            [ -n "$line" ] && nums+=("$line")
        done < <(python3 -c "
import json, sys, subprocess
try:
    res = subprocess.run(['mkvmerge', '-J', sys.argv[1]], capture_output=True, text=True)
    data = json.loads(res.stdout)
    for t in data.get('tracks', []):
        if t.get('type') in ('video', 'audio'):
            num = t.get('properties', {}).get('number')
            if num is None:
                num = t.get('id', 0) + 1
            print(num)
except Exception:
    pass
" "$file" 2>/dev/null)
    fi

    # Eğer python çıktısı boş kaldıysa mkvmerge json parse fallback
    if [ ${#nums[@]} -eq 0 ] && command -v mkvmerge &>/dev/null; then
        while IFS= read -r line; do
            [ -n "$line" ] && nums+=("$line")
        done < <(mkvmerge -J "$file" 2>/dev/null | grep -B 2 -A 10 -E '"type": "(video|audio)"' | grep '"number":' | awk -F': ' '{print $2}' | tr -d ', ')
    fi

    echo "${nums[@]}"
}

# Ana Başlık Ekranı
clear 2>/dev/null || true
echo -e "${CYAN}=====================================================${NC}"
echo -e "${CYAN}   STORAGE BOX MKV GÖRÜNTÜ VE SES BAŞLIĞI (TSI)    ${NC}"
echo -e "${CYAN}=====================================================${NC}"

get_storageboxes

if [ ${#UNIQUE_MOUNTS[@]} -eq 0 ]; then
    echo -e "\n${YELLOW}[BİLGİ] Kayıtlı veya mount edilmiş Storage Box bulunamadı.${NC}"
    read -p "Lütfen taranacak dizin yolunu manuel girin (Örn: /mnt/storagebox): " TARGET_DIR < /dev/tty
else
    echo -e "\n${BOLD}Sistemdeki Storage Box / Mount Konumları:${NC}\n"
    printf "%-5s %-35s %-15s %-20s\n" "NO" "MOUNT KONUMU" "DURUM" "KULLANIM"
    echo "-----------------------------------------------------------------------------------"

    COUNT=1
    for mp in "${UNIQUE_MOUNTS[@]}"; do
        if timeout 2 ls "$mp" &>/dev/null; then
            STATUS="${GREEN}[ONLINE]${NC}"
            USAGE=$(df -h "$mp" 2>/dev/null | tail -n 1 | awk '{print $3 "/" $2 " (" $5 ")"}')
        else
            STATUS="${RED}[OFFLINE]${NC}"
            USAGE="Erişilemiyor"
        fi
        printf "%-5s %-35s %-25b %-20s\n" "[$COUNT]" "$mp" "$STATUS" "$USAGE"
        COUNT=$((COUNT + 1))
    done

    CUSTOM_INDEX=$COUNT
    printf "%-5s %-35s\n" "[$CUSTOM_INDEX]" "Özel / Manuel Dizin Gir..."
    echo ""

    read -p "İşlem yapmak istediğiniz konumu seçin (1-$CUSTOM_INDEX): " CHOICE < /dev/tty

    if [ "$CHOICE" -eq "$CUSTOM_INDEX" ] 2>/dev/null; then
        read -p "Lütfen taranacak dizin yolunu girin: " TARGET_DIR < /dev/tty
    elif [ "$CHOICE" -ge 1 ] && [ "$CHOICE" -lt "$CUSTOM_INDEX" ] 2>/dev/null; then
        INDEX=$((CHOICE - 1))
        TARGET_DIR="${UNIQUE_MOUNTS[$INDEX]}"
    else
        echo -e "${RED}[HATA] Geçersiz seçim! İşlem iptal edildi.${NC}"
        exit 1
    fi
fi

# Hedef dizin kontrolü
if [ -z "$TARGET_DIR" ] || [ ! -d "$TARGET_DIR" ]; then
    echo -e "${RED}[HATA] Geçersiz veya bulunamayan dizin: '$TARGET_DIR'${NC}"
    exit 1
fi

if ! timeout 3 ls "$TARGET_DIR" &>/dev/null; then
    echo -e "${RED}[HATA] '$TARGET_DIR' dizinine erişilemiyor veya zaman aşımına uğradı.${NC}"
    exit 1
fi

echo -e "\n${CYAN}[1/3] '$TARGET_DIR' içindeki .mkv dosyaları taranıyor...${NC}"

FILES=()
while IFS= read -r -d '' file; do
    FILES+=("$file")
done < <(find "$TARGET_DIR" -type f \( -name "*.mkv" -o -name "*.MKV" \) -print0 2>/dev/null)

TOTAL=${#FILES[@]}

if [ "$TOTAL" -eq 0 ]; then
    echo -e "${YELLOW}[BİLGİ] '$TARGET_DIR' dizininde hiçbir .mkv dosyası bulunamadı.${NC}"
    exit 0
fi

echo -e "${GREEN}✔ Toplam $TOTAL adet .mkv dosyası tespit edildi.${NC}\n"
echo -e "${YELLOW}-----------------------------------------------------------------${NC}"
echo -e "${BOLD}DİKKAT:${NC} Tüm .mkv dosyalarındaki görüntü ve ses izlerinin başlığı '${BOLD}TSI${NC}' yapılacaktır."
echo -e "${BOLD}Görüntü ve ses dilleri (language) değiştirilmeyecek, aynen korunacaktır.${NC}"
echo -e "${YELLOW}-----------------------------------------------------------------${NC}\n"

read -p "İşlemi başlatmak istiyor musunuz? [E/h]: " CONFIRM < /dev/tty
CONFIRM=${CONFIRM:-E}

if [[ ! "$CONFIRM" =~ ^[EeYy]$ ]]; then
    echo -e "${YELLOW}İşlem kullanıcı tarafından iptal edildi.${NC}"
    exit 0
fi

echo -e "\n${CYAN}[2/3] Görüntü ve ses başlıkları 'TSI' olarak güncelleniyor...${NC}"

SUCCESS_COUNT=0
SKIPPED_COUNT=0
FAIL_COUNT=0
CURRENT=0

for file in "${FILES[@]}"; do
    CURRENT=$((CURRENT + 1))
    filename=$(basename "$file")

    echo -e "\n${BOLD}[$CURRENT/$TOTAL]${NC} $filename"
    echo -e "   └ Path: $file"

    # Yazma izni kontrolü
    if [ ! -w "$file" ]; then
        echo -e "   ${RED}└─► ✘ Dosyaya yazma izni yok! (Yazma yetkisini kontrol edin)${NC}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        continue
    fi

    # Görüntü ve ses izlerinin track numaralarını al
    TRACK_NUMS=($(get_video_audio_track_numbers "$file"))

    if [ ${#TRACK_NUMS[@]} -eq 0 ]; then
        echo -e "   ${YELLOW}└─► Görüntü/Ses izi bulunamadı, atlanıyor.${NC}"
        SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
        continue
    fi

    ARGS=()
    for num in "${TRACK_NUMS[@]}"; do
        ARGS+=(--edit "track:$num" --set "name=TSI")
    done

    # mkvpropedit çalıştır ve çıktıyı yakala
    ERR_OUTPUT=$(mkvpropedit "$file" "${ARGS[@]}" 2>&1)
    EXIT_CODE=$?

    if [ $EXIT_CODE -eq 0 ]; then
        echo -e "   ${GREEN}└─► ✔ Başarılı (${#TRACK_NUMS[@]} iz [görüntü + ses] başlığı 'TSI' yapıldı, diller korundu)${NC}"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
        CLEAN_ERR=$(echo "$ERR_OUTPUT" | tr '\n' ' ' | sed 's/  */ /g')
        echo -e "   ${RED}└─► ✘ Hata oluştu (Kod: $EXIT_CODE)${NC}"
        echo -e "       ${RED}Detay: ${CLEAN_ERR:0:150}${NC}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
done

echo -e "\n${CYAN}=====================================================${NC}"
echo -e "${CYAN}[3/3] İŞLEM TAMAMLANDI                              ${NC}"
echo -e "${CYAN}=====================================================${NC}"
echo -e " Toplam Dosya     : ${BOLD}$TOTAL${NC}"
echo -e " Başarılı         : ${GREEN}$SUCCESS_COUNT${NC}"
echo -e " İz Yok (Atlanan) : ${YELLOW}$SKIPPED_COUNT${NC}"
echo -e " Hatalı           : ${RED}$FAIL_COUNT${NC}"
echo -e "=====================================================\n"
