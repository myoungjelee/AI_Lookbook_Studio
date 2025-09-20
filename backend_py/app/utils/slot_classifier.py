"""
슬롯 데이터 구분 유틸리티
내부 데이터와 외부 데이터를 구분하는 로직
"""
from typing import Dict, Any, Tuple, List


def is_external_slot(item: Dict[str, Any]) -> bool:
    """
    슬롯 아이템이 외부 데이터인지 확인
    
    Args:
        item: 슬롯에 들어있는 아이템 데이터
        
    Returns:
        bool: 외부 데이터면 True, 내부 데이터면 False
    """
    if not item:
        return False
    
    # 외부 데이터 조건
    if item.get("isExternal") is True:
        return True
    
    if item.get("base64") and not item.get("pos") and not item.get("id"):
        return True
    
    return False


def is_internal_slot(item: Dict[str, Any]) -> bool:
    """
    슬롯 아이템이 내부 데이터인지 확인
    
    Args:
        item: 슬롯에 들어있는 아이템 데이터
        
    Returns:
        bool: 내부 데이터면 True, 외부 데이터면 False
    """
    if not item:
        return False
    
    # 내부 데이터 조건
    if item.get("pos") is not None:
        return True
    
    if item.get("id") and not item.get("isExternal"):
        return True
    
    return False


def categorize_slots(clothing_items: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    슬롯 데이터를 내부/외부로 분류
    
    Args:
        clothing_items: 모든 슬롯 데이터 (top, pants, shoes, outer)
        
    Returns:
        Tuple[Dict, Dict]: (내부_슬롯들, 외부_슬롯들)
    """
    internal_slots = {}
    external_slots = {}
    
    for slot_name, item in clothing_items.items():
        if not item:
            continue
            
        if is_external_slot(item):
            external_slots[slot_name] = item
        elif is_internal_slot(item):
            internal_slots[slot_name] = item
    
    return internal_slots, external_slots


def get_slot_type(item: Dict[str, Any]) -> str:
    """
    슬롯 아이템의 타입을 반환
    
    Args:
        item: 슬롯에 들어있는 아이템 데이터
        
    Returns:
        str: "internal", "external", "empty"
    """
    if not item:
        return "empty"
    
    if is_external_slot(item):
        return "external"
    elif is_internal_slot(item):
        return "internal"
    else:
        return "unknown"


def validate_slot_data(item: Dict[str, Any], slot_type: str) -> bool:
    """
    슬롯 데이터가 올바른 형식인지 검증
    
    Args:
        item: 슬롯에 들어있는 아이템 데이터
        slot_type: "internal" 또는 "external"
        
    Returns:
        bool: 유효하면 True, 유효하지 않으면 False
    """
    if not item:
        return False
    
    if slot_type == "external":
        # 외부 데이터: base64와 mimeType 필요
        return bool(item.get("base64") and item.get("mimeType"))
    
    elif slot_type == "internal":
        # 내부 데이터: pos 또는 id 필요
        return bool(item.get("pos") is not None or item.get("id"))
    
    return False
