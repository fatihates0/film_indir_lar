#!/bin/bash
# ==============================================================================
# Hetzner Storage Box Gelişmiş Yönetim Sihirbazı
# ==============================================================================

# Shell renklendirmeleri
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # Renksiz

# Root yetkisi kontrolü
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[HATA] Bu betik root (sudo) yetkisi ile çalıştırılmalıdır.${NC}"
  echo "Kullanım: curl -sSL <URL> | sudo bash"
  exit 1
fi

mkdir -p /etc/storagebox
mkdir -p /mnt/storageboxes

# ------------------------------------------------------------------------------
# Fonksiyon: Storage Box Bağlantılarını ve Durumlarını Listele
# ------------------------------------------------------------------------------
list_storageboxes() {
    echo -e "\n${CYAN}=====================================================${NC}"
    echo -e "${CYAN}     MEVCUT STORAGE BOX BAĞLANTILARI VE DURUMU        ${NC}"
    echo -e "${CYAN}=====================================================${NC}\n"

    # fstab içerisindeki cifs veya storagebox kayıtlarını bul
    ENTRIES=$(grep -E 'cifs|storagebox' /etc/fstab | grep -v '^#')

    if [ -z "$ENTRIES" ]; then
        echo -e "${YELLOW}[BİLGİ] Kayıtlı herhangi bir Storage Box bulunamadı.${NC}\n"
        return
    fi

    printf "%-5s %-30s %-25s %-15s %-20s\n" "NO" "MOUNT KONUMU" "SUNUCU" "DURUM" "KULLANIM"
    echo "-----------------------------------------------------------------------------------------------"

    COUNT=1
    echo "$ENTRIES" | while read -r line; do
        REMOTE=$(echo "$line" | awk '{print $1}')
        MOUNT_POINT=$(echo "$line" | awk '{print $2}')
        
        # Online / Offline Testi (2 saniye zaman aşımı ile)
        if timeout 2 ls "$MOUNT_POINT" &>/dev/null; then
            STATUS="${GREEN}[ONLINE]${NC}"
            USAGE=$(df -h "$MOUNT_POINT" 2>/dev/null | tail -n 1 | awk '{print $3 "/" $2 " (" $5 ")"}')
        else
            STATUS="${RED}[OFFLINE]${NC}"
            USAGE="Erişilemiyor"
        fi

        printf "%-5s %-30s %-25s %-25b %-20s\n" "[$COUNT]" "$MOUNT_POINT" "$REMOTE" "$STATUS" "$USAGE"
        COUNT=$((COUNT + 1))
    done
    echo ""
}

# ------------------------------------------------------------------------------
# Fonksiyon: Yeni Storage Box Ekle
# ------------------------------------------------------------------------------
add_storagebox() {
    echo -e "\n${CYAN}------------------- YENİ STORAGE BOX EKLE -------------------${NC}\n"

    read -p "1) Storage Box Kullanıcı Adı (Örn: u123456): " USERNAME < /dev/tty
    read -sp "2) Storage Box Şifresi: " PASSWORD < /dev/tty
    echo ""
    read -p "3) Mount Klasör Adı (Örn: box1, filmler, diziler): " FOLDER_NAME < /dev/tty

    if [ -z "$USERNAME" ] || [ -z "$PASSWORD" ] || [ -z "$FOLDER_NAME" ]; then
        echo -e "\n${RED}[HATA] Tüm alanları doldurmanız gerekmektedir!${NC}"
        read -p "Devam etmek için Enter'a basın..." dummy < /dev/tty
        return
    fi

    # Takılmaları ve çakışmaları önlemek için /mnt/storageboxes/ altını kullanıyoruz
    MOUNT_PATH="/mnt/storageboxes/${FOLDER_NAME}"
    CRED_PATH="/etc/storagebox/cred_${FOLDER_NAME}"
    SERVER_HOST="${USERNAME}.your-storagebox.de"

    echo -e "\n${YELLOW}--- ÖZET ---${NC}"
    echo -e "Kullanıcı Adı   : ${GREEN}${USERNAME}${NC}"
    echo -e "Sunucu Adresi   : ${GREEN}${SERVER_HOST}${NC}"
    echo -e "Mount Konumu    : ${GREEN}${MOUNT_PATH}${NC}"
    echo -e "----------------"

    read -p "Onaylıyor musunuz? (e/h): " CONFIRM < /dev/tty
    case "$CONFIRM" in
        [eE][vV][eE][tT]|[eE]|[yY][eE][sS]|[yY])
            echo -e "\n${CYAN}[1/4] Klasör oluşturuluyor (${MOUNT_PATH})...${NC}"
            mkdir -p "$MOUNT_PATH"

            echo -e "${CYAN}[2/4] Kimlik (credentials) dosyası yazılıyor...${NC}"
            cat <<EOF > "$CRED_PATH"
username=${USERNAME}
password=${PASSWORD}
EOF
            chmod 600 "$CRED_PATH"

            echo -e "${CYAN}[3/4] /etc/fstab güncelleniyor...${NC}"
            FSTAB_LINE="//${SERVER_HOST}/backup ${MOUNT_PATH} cifs credentials=${CRED_PATH},iocharset=utf8,rw,file_mode=0775,dir_mode=0775,noperm,_netdev 0 0"

            if grep -q "${MOUNT_PATH}" /etc/fstab; then
                echo -e "${YELLOW}[BİLGİ] ${MOUNT_PATH} zaten /etc/fstab dosyasında mevcut.${NC}"
            else
                echo "$FSTAB_LINE" >> /etc/fstab
                systemctl daemon-reload
                echo -e "${GREEN}[BAŞARILI] /etc/fstab güncellendi ve systemd yenilendi.${NC}"
            fi

            echo -e "${CYAN}[4/4] Bağlantı kuruluyor (mount)...${NC}"
            if mount "$MOUNT_PATH"; then
                echo -e "\n${GREEN}[BAŞARILI] Storage Box bağlandı: ${MOUNT_PATH}${NC}"
                ls -la "$MOUNT_PATH"
            else
                echo -e "\n${RED}[HATA] Mount başarısız! Bilgileri ve internet bağlantısını kontrol edin.${NC}"
            fi
            ;;
        *)
            echo -e "\n${YELLOW}İşlem iptal edildi.${NC}"
            ;;
    esac
    read -p "Devam etmek için Enter'a basın..." dummy < /dev/tty
}

# ------------------------------------------------------------------------------
# Fonksiyon: Storage Box Bağlantısını Sök ve Kaldır
# ------------------------------------------------------------------------------
remove_storagebox() {
    echo -e "\n${CYAN}----------------- STORAGE BOX KALDIR / SÖK -----------------${NC}\n"

    ENTRIES=$(grep -E 'cifs|storagebox' /etc/fstab | grep -v '^#')

    if [ -z "$ENTRIES" ]; then
        echo -e "${YELLOW}[BİLGİ] Kaldırılacak kayıtlı bir Storage Box bulunamadı.${NC}\n"
        read -p "Devam etmek için Enter'a basın..." dummy < /dev/tty
        return
    fi

    echo "Kaldırmak istediğiniz Storage Box'ın Mount Konumunu veya Klasör Adını yazın:"
    echo "Mevcut Konumlar:"
    echo "$ENTRIES" | awk '{print " - " $2}'
    echo ""

    read -p "Kaldırılacak Konum (Örn: /mnt/storageboxes/box1 veya box1): " TARGET < /dev/tty

    if [ -z "$TARGET" ]; then
        echo -e "${RED}[HATA] Geçerli bir konum girmediniz.${NC}"
        read -p "Devam etmek için Enter'a basın..." dummy < /dev/tty
        return
    fi

    # Tam yol değilse tamamla
    if [[ "$TARGET" != /* ]]; then
        TARGET="/mnt/storageboxes/${TARGET}"
    fi

    read -p "${RED}UYARI:${NC} ${TARGET} bağlantısı sökülecek ve /etc/fstab kaydı silinecek. Onaylıyor musunuz? (e/h): " CONFIRM < /dev/tty
    case "$CONFIRM" in
        [eE][vV][eE][tT]|[eE]|[yY][eE][sS]|[yY])
            echo -e "\n${CYAN}[1/3] Mount bağlantısı kesiliyor (umount)...${NC}"
            umount -f -l "$TARGET" 2>/dev/null

            echo -e "${CYAN}[2/3] /etc/fstab kaydı temizleniyor...${NC}"
            # Hedef satırı fstab'dan sil
            sed -i "\|${TARGET}|d" /etc/fstab
            systemctl daemon-reload

            echo -e "${CYAN}[3/3] İlişkili kimlik dosyası siliniyor...${NC}"
            FOLDER_NAME=$(basename "$TARGET")
            rm -f "/etc/storagebox/cred_${FOLDER_NAME}"

            echo -e "\n${GREEN}[BAŞARILI] ${TARGET} bağlantısı başarıyla kaldırıldı!${NC}\n"
            ;;
        *)
            echo -e "\n${YELLOW}İşlem iptal edildi.${NC}"
            ;;
    esac
    read -p "Devam etmek için Enter'a basın..." dummy < /dev/tty
}

# ------------------------------------------------------------------------------
# ANA MENÜ DÖNGÜSÜ
# ------------------------------------------------------------------------------
while true; do
    clear
    echo -e "${CYAN}=====================================================${NC}"
    echo -e "${CYAN}       HETZNER STORAGE BOX YÖNETİM MERKEZİ           ${NC}"
    echo -e "${CYAN}=====================================================${NC}"
    echo -e " 1) Mevcut Storage Box'ları Listele & Durum Kontrolü"
    echo -e " 2) Yeni Storage Box Ekle (Mount)"
    echo -e " 3) Storage Box Bağlantısını Kaldır (Unmount / Sil)"
    echo -e " 4) Çıkış"
    echo -e "${CYAN}=====================================================${NC}"
    
    read -p "Seçiminiz [1-4]: " CHOICE < /dev/tty

    case "$CHOICE" in
        1)
            list_storageboxes
            read -p "Devam etmek için Enter'a basın..." dummy < /dev/tty
            ;;
        2)
            add_storagebox
            ;;
        3)
            remove_storagebox
            ;;
        4)
            echo -e "\n${GREEN}İyi çalışmalar! Betikten çıkılıyor...${NC}\n"
            exit 0
            ;;
        *)
            echo -e "\n${RED}[HATA] Geçersiz seçim! Lütfen 1-4 arasında bir değer girin.${NC}"
            sleep 1.5
            ;;
    esac
done
