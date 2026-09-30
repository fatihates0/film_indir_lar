#!/bin/bash
# ==============================================================================
# Hetzner Storage Box İnteraktif Mount Betiği
# ==============================================================================

# Shell renklendirmeleri
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # Renksiz

# Root yetkisi kontrolü
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[HATA] Bu betik root (sudo) yetkisi ile çalıştırılmalıdır.${NC}"
  echo "Kullanım: sudo bash $0"
  exit 1
fi

mkdir -p /etc/storagebox

while true; do
    clear
    echo -e "${CYAN}=====================================================${NC}"
    echo -e "${CYAN}        HETZNER STORAGE BOX MOUNT SİHİRBAZI          ${NC}"
    echo -e "${CYAN}=====================================================${NC}\n"

    # 1. Bilgileri al
    read -p "1) Storage Box Kullanıcı Adı (Örn: u123456): " USERNAME
    read -sp "2) Storage Box Şifresi: " PASSWORD
    echo ""
    read -p "3) Mount Klasör Adı (Örn: box1, filmler, diziler): " FOLDER_NAME

    # Girdi doğrulama
    if [ -z "$USERNAME" ] || [ -z "$PASSWORD" ] || [ -z "$FOLDER_NAME" ]; then
        echo -e "\n${RED}[HATA] Tüm alanları doldurmanız gerekmektedir!${NC}"
        read -p "Devam etmek için Enter'a basın..." dummy
        continue
    fi

    MOUNT_PATH="/mnt/storagebox/${FOLDER_NAME}"
    CRED_PATH="/etc/storagebox/cred_${FOLDER_NAME}"
    SERVER_HOST="${USERNAME}.your-storagebox.de"

    # 2. Özet Göster ve Onay Al
    echo -e "\n${YELLOW}----------------- GİRDİĞİNİZ BİLGİLER -----------------${NC}"
    echo -e "Kullanıcı Adı   : ${GREEN}${USERNAME}${NC}"
    echo -e "Sunucu Adresi   : ${GREEN}${SERVER_HOST}${NC}"
    echo -e "Mount Konumu    : ${GREEN}${MOUNT_PATH}${NC}"
    echo -e "Kimlik Dosyası  : ${GREEN}${CRED_PATH}${NC}"
    echo -e "${YELLOW}-------------------------------------------------------${NC}\n"

    read -p "Bu bilgileri onaylayıp mount etmek istiyor musunuz? (e/h): " CONFIRM
    case "$CONFIRM" in
        [eE][vV][eE][tT]|[eE]|[yY][eE][sS]|[yY])
            echo -e "\n${CYAN}[1/4] Mount dizini oluşturuluyor (${MOUNT_PATH})...${NC}"
            mkdir -p "$MOUNT_PATH"

            echo -e "${CYAN}[2/4] Kimlik (credentials) dosyası yazılıyor...${NC}"
            cat <<EOF > "$CRED_PATH"
username=${USERNAME}
password=${PASSWORD}
EOF
            chmod 600 "$CRED_PATH"

            echo -e "${CYAN}[3/4] /etc/fstab kalıcı mount dosyası güncelleniyor...${NC}"
            FSTAB_LINE="//${SERVER_HOST}/backup ${MOUNT_PATH} cifs credentials=${CRED_PATH},iocharset=utf8,rw,file_mode=0775,dir_mode=0775,noperm,_netdev 0 0"

            if grep -q "${MOUNT_PATH}" /etc/fstab; then
                echo -e "${YELLOW}[BİLGİ] ${MOUNT_PATH} zaten /etc/fstab içinde kayıtlı. Tekrar eklenmedi.${NC}"
            else
                echo "$FSTAB_LINE" >> /etc/fstab
                echo -e "${GREEN}[BAŞARILI] /etc/fstab güncellendi.${NC}"
            fi

            echo -e "${CYAN}[4/4] Storage Box sunucuya bağlanıyor (mount)...${NC}"
            if mount "$MOUNT_PATH"; then
                echo -e "\n${GREEN}=====================================================${NC}"
                echo -e "${GREEN}  TEBRİKLER! Storage Box başarıyla mount edildi.     ${NC}"
                echo -e "${GREEN}  Konum: ${MOUNT_PATH}${NC}"
                echo -e "${GREEN}=====================================================${NC}\n"
                ls -la "$MOUNT_PATH"
            else
                echo -e "\n${RED}[HATA] Mount işlemi başarısız oldu! Lütfen kullanıcı adı ve şifrenizi kontrol edin.${NC}"
            fi
            ;;
        *)
            echo -e "\n${YELLOW}İşlem iptal edildi.${NC}"
            ;;
    esac

    echo ""
    read -p "Başka bir Storage Box eklemek istiyor musunuz? (e/h): " ANOTHER
    case "$ANOTHER" in
        [eE][vV][eE][tT]|[eE]|[yY][eE][sS]|[yY])
            continue
            ;;
        *)
            echo -e "\n${GREEN}İşlem tamamlandı. İyi çalışmalar!${NC}\n"
            break
            ;;
    esac
done
