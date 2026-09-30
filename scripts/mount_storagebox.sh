#!/bin/bash
# ==============================================================================
# Hetzner Storage Box Gelişmiş Yönetim Sihirbazı (v2.2 - Error 79 Kesin Çözümlü)
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

# Gerekli paketleri kontrol et ve kur
if ! command -v mount.cifs &>/dev/null; then
    echo -e "${YELLOW}[BİLGİ] Sunucuda 'cifs-utils' paketi eksik. Otomatik yükleniyor...${NC}"
    if command -v apt-get &>/dev/null; then
        apt-get update -qq && apt-get install -y -qq cifs-utils keyutils
    elif command -v yum &>/dev/null; then
        yum install -y cifs-utils keyutils
    fi
fi

# CIFS çekirdek modülünü yükle
modprobe cifs 2>/dev/null

# Gerekli ana dizinleri ve okuma izinlerini oluştur
mkdir -p /etc/storagebox
mkdir -p /mnt/storageboxes
chmod 755 /mnt /mnt/storageboxes

# ------------------------------------------------------------------------------
# Fonksiyon: Storage Box Bağlantılarını ve Durumlarını Listele
# ------------------------------------------------------------------------------
list_storageboxes() {
    echo -e "\n${CYAN}=====================================================${NC}"
    echo -e "${CYAN}     MEVCUT STORAGE BOX BAĞLANTILARI VE DURUMU        ${NC}"
    echo -e "${CYAN}=====================================================${NC}\n"

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
    read -p "3) Storage Box Ağ Yolu / URL [Varsayılan: //${USERNAME}.your-storagebox.de/backup]: " RAW_HOST < /dev/tty
    read -p "4) Mount Klasör Adı (Örn: box1, filmler, diziler): " FOLDER_NAME < /dev/tty

    if [ -z "$USERNAME" ] || [ -z "$PASSWORD" ] || [ -z "$FOLDER_NAME" ]; then
        echo -e "\n${RED}[HATA] Tüm zorunlu alanları (Kullanıcı Adı, Şifre, Klasör Adı) doldurmanız gerekmektedir!${NC}"
        read -p "Devam etmek için Enter'a basın..." dummy < /dev/tty
        return
    fi

    # Sunucu/Paylaşım yolu belirleme (Baştaki // eksikse otomatik ekle)
    if [ -z "$RAW_HOST" ]; then
        SERVER_HOST="//${USERNAME}.your-storagebox.de/backup"
    else
        SERVER_HOST="$RAW_HOST"
        if [[ "$SERVER_HOST" != //* ]]; then
            SERVER_HOST="//${SERVER_HOST}"
        fi
    fi

    # Mount yolu ve kimlik dosyası belirleme
    MOUNT_PATH="/mnt/storageboxes/${FOLDER_NAME}"
    CRED_PATH="/etc/storagebox/cred_${FOLDER_NAME}"

    echo -e "\n${YELLOW}--- ÖZET ---${NC}"
    echo -e "Kullanıcı Adı   : ${GREEN}${USERNAME}${NC}"
    echo -e "Ağ Yolu / URL   : ${GREEN}${SERVER_HOST}${NC}"
    echo -e "Mount Konumu    : ${GREEN}${MOUNT_PATH}${NC}"
    echo -e "----------------"

    read -p "Onaylıyor musunuz? (e/h): " CONFIRM < /dev/tty
    case "$CONFIRM" in
        [eE][vV][eE][tT]|[eE]|[yY][eE][sS]|[yY])
            echo -e "\n${CYAN}[1/4] Mount klasörü oluşturuluyor ve izinler ayarlanıyor...${NC}"
            mkdir -p "$MOUNT_PATH"
            chmod 777 "$MOUNT_PATH"

            echo -e "${CYAN}[2/4] Kimlik (credentials) dosyası yazılıyor...${NC}"
            cat <<EOF > "$CRED_PATH"
username=${USERNAME}
password=${PASSWORD}
EOF
            chmod 600 "$CRED_PATH"

            echo -e "${CYAN}[3/4] /etc/fstab güncelleniyor...${NC}"
            # NOT: iocharset=utf8 seçeneği Linux çekirdeğinde Error 79 (ELIBACC) verdiğinden kaldırıldı!
            # SMB3 varsayılan olarak UTF-16/UTF-8 kullanır.
            FSTAB_LINE="${SERVER_HOST} ${MOUNT_PATH} cifs credentials=${CRED_PATH},rw,file_mode=0777,dir_mode=0777,vers=3.0,_netdev 0 0"

            if grep -q "${MOUNT_PATH}" /etc/fstab; then
                ESCAPED_PATH=$(echo "$MOUNT_PATH" | sed 's/\//\\\//g')
                sed -i "/${ESCAPED_PATH}/d" /etc/fstab
            fi

            echo "$FSTAB_LINE" >> /etc/fstab
            systemctl daemon-reload 2>/dev/null
            echo -e "${GREEN}[BAŞARILI] /etc/fstab güncellendi.${NC}"

            echo -e "${CYAN}[4/4] Bağlantı kuruluyor (mount)...${NC}"
            
            MOUNT_SUCCESS=0
            # Deneme 1: fstab üzerinden varsayılan vers=3.0 ile mount
            if mount "$MOUNT_PATH" 2>/dev/null; then
                MOUNT_SUCCESS=1
            else
                # Deneme 2: vers=2.1 ile dene
                sed -i "s/vers=3.0/vers=2.1/g" /etc/fstab
                systemctl daemon-reload 2>/dev/null
                if mount "$MOUNT_PATH" 2>/dev/null; then
                    MOUNT_SUCCESS=1
                else
                    # Deneme 3: vers parametresi olmadan dene
                    sed -i "s/,vers=2.1//g" /etc/fstab
                    systemctl daemon-reload 2>/dev/null
                    if mount "$MOUNT_PATH" 2>/dev/null; then
                        MOUNT_SUCCESS=1
                    else
                        # Deneme 4: Doğrudan mount.cifs komutu ile dene
                        if mount -t cifs "$SERVER_HOST" "$MOUNT_PATH" -o "credentials=${CRED_PATH},rw,file_mode=0777,dir_mode=0777" 2>/dev/null; then
                            MOUNT_SUCCESS=1
                        fi
                    fi
                fi
            fi

            if [ "$MOUNT_SUCCESS" -eq 1 ]; then
                chmod 777 "$MOUNT_PATH"
                echo -e "\n${GREEN}=====================================================${NC}"
                echo -e "${GREEN}  BAŞARILI! Storage Box bağlandı: ${MOUNT_PATH}${NC}"
                echo -e "${GREEN}=====================================================${NC}\n"
                
                # Jellyfin Docker uyarısı & Otomatik Yeniden Başlatma
                if command -v docker &>/dev/null && docker ps | grep -q jellyfin; then
                    echo -e "${YELLOW}[BİLGİ] Jellyfin Docker konteyneri tespit edildi.${NC}"
                    echo -e "${CYAN}Jellyfin'in yeni eklenen mount diskini görebilmesi için konteyner yeniden başlatılıyor...${NC}"
                    docker restart jellyfin &>/dev/null
                    echo -e "${GREEN}[BAŞARILI] Jellyfin yeniden başlatıldı!${NC}\n"
                fi
                
                ls -la "$MOUNT_PATH"
            else
                echo -e "\n${RED}[HATA] Mount başarısız oldu!${NC}"
                echo -e "${RED}Çekirdek Logu (dmesg):${NC}"
                dmesg | tail -n 5
                echo -e "\n${RED}Olası Sebepler:${NC}"
                echo " 1. Hetzner Robot Paneli > Storage Box > 'Configuration' sekmesinde Samba/CIFS seçeneği kapalı olabilir."
                echo " 2. Şifrenizde özel simgeler varsa kısıtlama yaratmış olabilir."
                echo " 3. Sunucu 445 portu güvenlik duvarı tarafından engelleniyor olabilir."
            fi
            ;;
        *)
            echo -e "\n${YELLOW}İşlem iptal edildi.${NC}"
            ;;
    esac
    read -p "Devam etmek için Enter'a basın..." dummy < /dev/tty
}

# ------------------------------------------------------------------------------
# Fonksiyon: Storage Box Bağlantısını Sök ve Kaldır (Numaralı Seçim Destekli)
# ------------------------------------------------------------------------------
remove_storagebox() {
    echo -e "\n${CYAN}----------------- STORAGE BOX KALDIR / SÖK -----------------${NC}\n"

    ENTRIES=$(grep -E 'cifs|storagebox' /etc/fstab | grep -v '^#')

    if [ -z "$ENTRIES" ]; then
        echo -e "${YELLOW}[BİLGİ] Kaldırılacak kayıtlı bir Storage Box bulunamadı.${NC}\n"
        read -p "Devam etmek için Enter'a basın..." dummy < /dev/tty
        return
    fi

    echo -e "${YELLOW}Kaldırmak istediğiniz Storage Box'ı seçin:${NC}\n"

    MOUNT_LIST=()
    COUNT=1
    while read -r line; do
        MP=$(echo "$line" | awk '{print $2}')
        REMOTE=$(echo "$line" | awk '{print $1}')
        MOUNT_LIST+=("$MP")
        echo -e " ${CYAN}${COUNT})${NC} ${MP} (${REMOTE})"
        COUNT=$((COUNT + 1))
    done <<< "$ENTRIES"

    echo ""
    read -p "Kaldırılacak numara (1-${#MOUNT_LIST[@]}) veya klasör adı/yolu: " TARGET_INPUT < /dev/tty

    if [ -z "$TARGET_INPUT" ]; then
        echo -e "${RED}[HATA] Geçerli bir seçim girmediniz.${NC}"
        read -p "Devam etmek için Enter'a basın..." dummy < /dev/tty
        return
    fi

    if [[ "$TARGET_INPUT" =~ ^[0-9]+$ ]] && [ "$TARGET_INPUT" -ge 1 ] && [ "$TARGET_INPUT" -le "${#MOUNT_LIST[@]}" ]; then
        INDEX=$((TARGET_INPUT - 1))
        TARGET="${MOUNT_LIST[$INDEX]}"
    else
        TARGET="$TARGET_INPUT"
        if [[ "$TARGET" != /* ]]; then
            TARGET="/mnt/storageboxes/${TARGET}"
        fi
    fi

    read -p "$(echo -e "${RED}UYARI:${NC} ${TARGET} bağlantısı sökülecek ve /etc/fstab kaydı silinecek. Onaylıyor musunuz? (e/h): ")" CONFIRM < /dev/tty
    case "$CONFIRM" in
        [eE][vV][eE][tT]|[eE]|[yY][eE][sS]|[yY])
            echo -e "\n${CYAN}[1/4] Mount bağlantısı kesiliyor (umount)...${NC}"
            umount -f -l "$TARGET" 2>/dev/null

            echo -e "${CYAN}[2/4] /etc/fstab kaydı temizleniyor...${NC}"
            ESCAPED_TARGET=$(echo "$TARGET" | sed 's/\//\\\//g')
            sed -i "/${ESCAPED_TARGET}/d" /etc/fstab
            systemctl daemon-reload 2>/dev/null

            echo -e "${CYAN}[3/4] İlişkili kimlik dosyası siliniyor...${NC}"
            FOLDER_NAME=$(basename "$TARGET")
            rm -f "/etc/storagebox/cred_${FOLDER_NAME}"

            echo -e "${CYAN}[4/4] Boş klasör temizleniyor...${NC}"
            rmdir "$TARGET" 2>/dev/null

            echo -e "\n${GREEN}[BAŞARILI] ${TARGET} bağlantısı ve kaydı başarıyla kaldırıldı!${NC}\n"
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
