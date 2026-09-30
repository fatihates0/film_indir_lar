#!/bin/bash
# ==============================================================================
# Storage Box MKV Ses Başlığı Güncelleme Betiği (TSI)
# ==============================================================================
# Seçilen Storage Box veya dizindeki tüm .mkv dosyalarını tarar,
# ses dosyalarının başlıklarını "TSI" yapar (ses dillerini DEĞİŞTİRMEZ).
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
        apt-get update -qq && apt-get install -y -qq mkvtoolnix
    elif command -v yum &>/dev/null; then
        yum install -y mkvtoolnix
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

# MKV dosyasındaki ses izi sayısını bul (mkvmerge veya ffprobe ile)
get_audio_track_count() {
    local file="$1"
    local count=0

    if command -v mkvmerge &>/dev/null; then
        count=$(mkvmerge -J "$file" 2>/dev/null | grep -c '"type": "audio"')
    elif command -v ffprobe &>/dev/null; then
        count=$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$file" 2>/dev/null | wc -l)
    else
        count=1
    fi

    echo "$count" | tr -d ' '
}

# Ana Başlık Ekranı
clear 2>/dev/null || true
echo -e "${CYAN}=====================================================${NC}"
echo -e "${CYAN}   STORAGE BOX MKV SES BAŞLIĞI GÜNCELLEME (TSI)     ${NC}"
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
echo -e "${BOLD}DİKKAT:${NC} Tüm .mkv dosyalarındaki ses izlerinin başlığı '${BOLD}TSI${NC}' yapılacaktır."
echo -e "${BOLD}Ses dili (language) değiştirilmeyecek, aynen korunacaktır.${NC}"
echo -e "${YELLOW}-----------------------------------------------------------------${NC}\n"

read -p "İşlemi başlatmak istiyor musunuz? [E/h]: " CONFIRM < /dev/tty
CONFIRM=${CONFIRM:-E}

if [[ ! "$CONFIRM" =~ ^[EeYy]$ ]]; then
    echo -e "${YELLOW}İşlem kullanıcı tarafından iptal edildi.${NC}"
    exit 0
fi

echo -e "\n${CYAN}[2/3] Ses başlıkları 'TSI' olarak güncelleniyor...${NC}"

SUCCESS_COUNT=0
SKIPPED_COUNT=0
FAIL_COUNT=0
CURRENT=0

for file in "${FILES[@]}"; do
    CURRENT=$((CURRENT + 1))
    filename=$(basename "$file")

    echo -e "\n${BOLD}[$CURRENT/$TOTAL]${NC} $filename"
    echo -e "   └ Path: $file"

    AUDIO_COUNT=$(get_audio_track_count "$file")

    if [ "$AUDIO_COUNT" -le 0 ]; then
        echo -e "   ${YELLOW}└─► Ses izi bulunamadı, atlanıyor.${NC}"
        SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
        continue
    fi

    ARGS=()
    for (( i=1; i<=AUDIO_COUNT; i++ )); do
        ARGS+=(--edit "track:a$i" --set "title=TSI")
    done

    if mkvpropedit "$file" "${ARGS[@]}" &>/dev/null; then
        echo -e "   ${GREEN}└─► ✔ Başarılı ($AUDIO_COUNT ses izi başlığı 'TSI' yapıldı, dil korundu)${NC}"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
        echo -e "   ${RED}└─► ✘ Hata oluştu (mkvpropedit işlemi başarısız)${NC}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
done

echo -e "\n${CYAN}=====================================================${NC}"
echo -e "${CYAN}[3/3] İŞLEM TAMAMLANDI                              ${NC}"
echo -e "${CYAN}=====================================================${NC}"
echo -e " Toplam Dosya     : ${BOLD}$TOTAL${NC}"
echo -e " Başarılı         : ${GREEN}$SUCCESS_COUNT${NC}"
echo -e " Ses Yok (Atlanan): ${YELLOW}$SKIPPED_COUNT${NC}"
echo -e " Hatalı           : ${RED}$FAIL_COUNT${NC}"
echo -e "=====================================================\n"
