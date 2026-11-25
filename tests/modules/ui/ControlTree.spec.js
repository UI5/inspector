'use strict';

var ControlTree = require('../../../app/scripts/modules/ui/ControlTree.js');
var utils = require('../../../app/scripts/modules/utils/utils.js');

var mockControlTree = {'versionInfo':{'version':'1.26.10','framework':'OPENUI5'},'controls':[{'id':'Shell','name':'sap.m.Shell','type':'data-sap-ui','content':[{'id':'__container0','name':'sap.ui.core.ComponentContainer','type':'data-sap-ui','content':[{'id':'app','name':'sap.ui.core.mvc.JSView','type':'data-sap-ui','content':[{'id':'splitApp','name':'sap.m.SplitApp','type':'data-sap-ui','content':[{'id':'splitApp-Master','name':'sap.m.NavContainer','type':'data-sap-ui','content':[{'id':'__xmlview0','name':'sap.ui.core.mvc.XMLView','type':'data-sap-ui','content':[{'id':'__xmlview0--page','name':'sap.m.Page','type':'data-sap-ui','content':[{'id':'__toolbar0','name':'sap.m.Toolbar','type':'data-sap-ui','content':[{'id':'__button0','name':'sap.m.Button','type':'data-sap-ui','content':[{'id':'__button0-img','name':'sap.ui.core.Icon','type':'data-sap-ui','content':[]}]},{'id':'__spacer0','name':'sap.m.ToolbarSpacer','type':'data-sap-ui','content':[]},{'id':'__label0','name':'sap.m.Label','type':'data-sap-ui','content':[]},{'id':'__spacer1','name':'sap.m.ToolbarSpacer','type':'data-sap-ui','content':[]},{'id':'__button1','name':'sap.m.Button','type':'data-sap-ui','content':[{'id':'__button1-img','name':'sap.ui.core.Icon','type':'data-sap-ui','content':[]}]}]},{'id':'__xmlview0--searchBar','name':'sap.m.Bar','type':'data-sap-ui','content':[{'id':'__xmlview0--searchField','name':'sap.m.SearchField','type':'data-sap-ui','content':[]}]},{'id':'__xmlview0--list','name':'sap.m.List','type':'data-sap-ui','content':[{'id':'__xmlview0--vsFilterBar','name':'sap.m.Toolbar','type':'data-sap-ui','content':[]},{'id':'__item1','name':'sap.m.GroupHeaderListItem','type':'data-sap-ui','content':[]},{'id':'__item0-__xmlview0--list-0','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-0-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-1','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-1-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-2','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-2-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-3','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-3-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-4','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-4-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-5','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-5-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-6','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-6-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-7','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-7-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item2','name':'sap.m.GroupHeaderListItem','type':'data-sap-ui','content':[]},{'id':'__item0-__xmlview0--list-8','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-8-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-9','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-9-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-10','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-10-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-11','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-11-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-12','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-12-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-13','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-13-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-14','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-14-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-15','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-15-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-16','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-16-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-17','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-17-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item3','name':'sap.m.GroupHeaderListItem','type':'data-sap-ui','content':[]},{'id':'__item0-__xmlview0--list-18','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-18-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-19','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-19-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-20','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-20-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-21','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-21-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-22','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-22-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-23','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-23-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-24','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-24-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-25','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-25-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-26','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-26-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-27','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-27-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-28','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-28-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-29','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-29-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-30','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-30-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-31','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-31-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-32','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-32-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item4','name':'sap.m.GroupHeaderListItem','type':'data-sap-ui','content':[]},{'id':'__item0-__xmlview0--list-33','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-33-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-34','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-34-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-35','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-35-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-36','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-36-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-37','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-37-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-38','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-38-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-39','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-39-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-40','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-40-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item5','name':'sap.m.GroupHeaderListItem','type':'data-sap-ui','content':[]},{'id':'__item0-__xmlview0--list-41','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-41-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-42','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-42-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-43','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-43-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-44','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-44-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-45','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-45-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-46','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-46-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-47','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-47-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-48','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-48-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-49','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-49-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-50','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-50-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-51','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-51-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-52','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-52-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item6','name':'sap.m.GroupHeaderListItem','type':'data-sap-ui','content':[]},{'id':'__item0-__xmlview0--list-53','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-53-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-54','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-54-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-55','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-55-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-56','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-56-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-57','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-57-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-58','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-58-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-59','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-59-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-60','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-60-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-61','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-61-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-62','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-62-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item7','name':'sap.m.GroupHeaderListItem','type':'data-sap-ui','content':[]},{'id':'__item0-__xmlview0--list-63','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-63-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item8','name':'sap.m.GroupHeaderListItem','type':'data-sap-ui','content':[]},{'id':'__item0-__xmlview0--list-64','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-64-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item9','name':'sap.m.GroupHeaderListItem','type':'data-sap-ui','content':[]},{'id':'__item0-__xmlview0--list-65','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-65-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-66','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-66-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-67','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-67-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item10','name':'sap.m.GroupHeaderListItem','type':'data-sap-ui','content':[]},{'id':'__item0-__xmlview0--list-68','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-68-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-69','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-69-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-70','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-70-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-71','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-71-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-72','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-72-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-73','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-73-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-74','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-74-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-75','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-75-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-76','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-76-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-77','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-77-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-78','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-78-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-79','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-79-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-80','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-80-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-81','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-81-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-82','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-82-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-83','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-83-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-84','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-84-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-85','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-85-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-86','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-86-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-87','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-87-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-88','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-88-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-89','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-89-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]},{'id':'__item0-__xmlview0--list-90','name':'sap.m.StandardListItem','type':'data-sap-ui','content':[{'id':'__item0-__xmlview0--list-90-selectSingleMaster','name':'sap.m.RadioButton','type':'data-sap-ui','content':[]}]}]}]}]}]},{'id':'splitApp-Detail','name':'sap.m.NavContainer','type':'data-sap-ui','content':[{'id':'__xmlview1','name':'sap.ui.core.mvc.XMLView','type':'data-sap-ui','content':[{'id':'__page0','name':'sap.m.Page','type':'data-sap-ui','content':[{'id':'__page0-intHeader','name':'sap.m.Bar','type':'data-sap-ui','content':[{'id':'__page0-title','name':'sap.m.Label','type':'data-sap-ui','content':[]}]},{'id':'__xmlview1--titles','name':'sap.ui.core.mvc.HTMLView','type':'data-sap-ui','content':[]}]}]}]}]}]}]}]}]};

var mockControlTreeEdited = {
    versionInfo: {
        framework: 'OPENUI5',
        version: '1.26.10'
    },
    controls: [{
        'id': 'ShellEdited',
        'name': 'sap.m.Shell',
        'type': 'data-sap-ui',
        'content': []
    }]
};

describe('ControlTree', function () {
    var fixtures = document.getElementById('fixtures');
    var controlTree;

    beforeEach(function () {
        fixtures.innerHTML = '<control-tree id="control-tree" ></control-tree>';
    });

    afterEach(function () {
        document.getElementById('control-tree').parentNode.removeChild(document.getElementById('control-tree'));
    });

    describe('Constructor', function () {

        it('should instantiate without initial data ', function () {
            controlTree = new ControlTree('control-tree');
            var isEmpty = utils.isObjectEmpty(controlTree._data);

            should.equal(isEmpty, true);
        });

        it('should has default methods without specifying them', function () {
            controlTree = new ControlTree('control-tree', {});

            controlTree.onSelectionChanged.should.be.a('function');
            controlTree.onHoverChanged.should.be.a('function');
            controlTree.onInitialRendering.should.be.a('function');
        });

        it('should overwrite #onSelectionChanged() if needed', function () {
            controlTree = new ControlTree('control-tree', {
                /**
                 * Overwrite ControlTree method.
                 * @returns {string}
                 */
                onSelectionChanged: function () {
                    return 'overwritten';
                }
            });

            controlTree.onSelectionChanged().should.equal('overwritten');
        });

        it('should overwrite #onHoverChanged() if needed', function () {
            controlTree = new ControlTree('control-tree', {
                /**
                 * Overwrite ControlTree method.
                 * @returns {string}
                 */
                onHoverChanged: function () {
                    return 'overwritten';
                }
            });

            controlTree.onHoverChanged().should.equal('overwritten');
        });

        it('should overwrite #onInitialRendering() if needed', function () {
            controlTree = new ControlTree('control-tree', {
                /**
                 * Overwrite ControlTree method.
                 * @returns {string}
                 */
                onInitialRendering: function () {
                    return 'overwritten';
                }
            });

            controlTree.onInitialRendering().should.equal('overwritten');
        });
    });

    describe('Methods', function () {
        beforeEach(function () {
            controlTree = new ControlTree('control-tree', {
                data: mockControlTree
            });
        });

        it('should be rendered with two children', function () {
            var controlTree = document.getElementById('control-tree');
            var controlTreeChildren = controlTree.children.length;
            controlTreeChildren.should.equals(2);
        });

        describe('#init()', function () {
            var controlTreeCreateHTML;
            var controlTreeCreateCreateHandlers;

            beforeEach(function () {
                controlTreeCreateHTML = sinon.spy(controlTree, '_createHTML');
                controlTreeCreateCreateHandlers = sinon.spy(controlTree, '_createHandlers');

                controlTree.init();
            });

            afterEach(function () {
                controlTree._createHTML.restore();
                controlTree._createHandlers.restore();
            });

            it('should call "#_createHTML()" only once', function () {
                controlTreeCreateHTML.callCount.should.equal(1);
            });

            it('should call "#_createHandlers()" only once', function () {
                controlTreeCreateCreateHandlers.callCount.should.equal(1);
            });

            it('should call all methods in the right order', function () {
                sinon.assert.callOrder(controlTreeCreateHTML, controlTreeCreateCreateHandlers);
            });

        });

        describe('#getData()', function () {
            it('should not be undefined', function () {
                controlTree.getData().should.not.be.undefined;
            });

            it('should return ControlTree._data value', function () {
                controlTree.getData().should.equals(controlTree._data);
            });

        });

        describe('#setData()', function () {
            var onInitialRendering;
            var init;

            beforeEach(function () {
                onInitialRendering = sinon.spy(controlTree, 'onInitialRendering');
                init = sinon.spy(controlTree, 'init');
            });

            afterEach(function () {
                controlTree.onInitialRendering.restore();
                controlTree.init.restore();
            });

            it('should change ControlTree._data', function () {
                controlTree.setData(mockControlTreeEdited);
                controlTree._data.controls[0].id.should.equal(mockControlTreeEdited.controls[0].id);
            });

            it('should return ControlTree', function () {
                var controlTreeWithSetData = controlTree.setData(mockControlTreeEdited);
                controlTreeWithSetData.should.equal(controlTree);
            });

            it('should return undefined if the same data is set twice', function () {
                controlTree.setData(mockControlTreeEdited);
                var controlTreeWithSetData = controlTree.setData(mockControlTreeEdited);

                should.equal(controlTreeWithSetData, undefined);
            });

            it('should not accept "string" as parameter', function () {
                controlTree.setData('someString');
                controlTree._data.should.not.equal('someString');
            });

            it('should not accept "array" as parameter', function () {
                controlTree.setData([]);
                controlTree._data.should.not.equal([]);
            });

            it('should not accept "number" as parameter', function () {
                controlTree.setData(123);
                controlTree._data.should.not.equal(123);
            });

            it('should not accept "null" as parameter', function () {
                controlTree.setData(null);
                controlTree._data.should.not.equal(null);
            });

            it('should not accept "undefined" as parameter', function () {
                controlTree.setData(undefined);
                controlTree._data.should.not.equal(undefined);
            });

            it('should fire #onInitialRendering() on first used', function () {
                controlTree._isFirstRendering = undefined;
                controlTree.setData(mockControlTreeEdited);

                onInitialRendering.callCount.should.equal(1);
            });
        });

        describe('#getSelectedElement()', function () {
            it('should return controlTree._selectedElement value', function () {
                controlTree._selectedElement = 'test';
                controlTree.getSelectedElement().should.equals(controlTree._selectedElement);
            });
        });

        describe('#setSelectedElement()', function () {
            var mock = ' <li id="Shell" selected="true"></li>';
            beforeEach(function () {
                controlTree._selectedElement = mock;
            });

            it('should not accept "object" as parameter', function () {
                controlTree.setSelectedElement({});
                controlTree._selectedElement.should.not.equal({});
            });

            it('should not accept "array" as parameter', function () {
                controlTree.setData([]);
                controlTree._selectedElement.should.not.equal([]);
            });

            it('should not accept "number" as parameter', function () {
                controlTree.setData(123);
                controlTree._selectedElement.should.not.equal(123);
            });

            describe('should accept "string" as parameter', function () {
                it('but should not change controlTree._selectedElement if the parameter is not an ID of a child element', function () {
                    controlTree.setSelectedElement('some text');
                    controlTree._selectedElement.should.equal(mock);
                });

                it('and change controlTree._selectedElement if the parameter is an ID of a child element', function () {
                    controlTree.setSelectedElement('Shell');
                    controlTree.getSelectedElement().should.not.equals(mock);
                });

            });

            describe('should ', function () {
                var controlTreeSelectTreeElement;

                beforeEach(function () {
                    controlTreeSelectTreeElement = sinon.spy(controlTree, '_selectTreeElement');
                });

                afterEach(function () {
                    controlTree._selectTreeElement.restore();
                });

                it('call "#_selectTreeElement()" only once', function () {
                    controlTree.setSelectedElement('Shell');
                    controlTreeSelectTreeElement.callCount.should.equal(1);
                });

                it('not call "#_selectTreeElement()" when the parameter is invalid', function () {
                    controlTree.setSelectedElement('some text');
                    controlTreeSelectTreeElement.callCount.should.equal(0);
                });

            });
        });

        describe('#_createHTML()', function () {

            describe('should call', function () {
                var controlTreeCreateFilter;
                var controlTreeCreateTreeContainer;
                var controlTreeSetReferences;
                var controlTreeCreateTree;

                beforeEach(function () {
                    controlTreeCreateFilter = sinon.spy(controlTree, '_createFilter');
                    controlTreeCreateTreeContainer = sinon.spy(controlTree, '_createTreeContainer');
                    controlTreeSetReferences = sinon.spy(controlTree, '_setReferences');
                    controlTreeCreateTree = sinon.spy(controlTree, '_createTree');

                    controlTree._createHTML();
                });

                afterEach(function () {
                    controlTree._createFilter.restore();
                    controlTree._createTreeContainer.restore();
                    controlTree._setReferences.restore();
                    controlTree._createTree.restore();
                });

                it('"#_createFilter()" only once', function () {
                    controlTreeCreateFilter.callCount.should.equal(1);
                });

                it('"#_createTreeContainer()" only once', function () {
                    controlTreeCreateTreeContainer.callCount.should.equal(1);
                });

                it('"#_setReferences()" only once', function () {
                    controlTreeSetReferences.callCount.should.equal(1);
                });

                it('"#_createTree()" only once', function () {
                    controlTreeCreateTree.callCount.should.equal(1);
                });

                it('all methods in the right order', function () {
                    sinon.assert.callOrder(controlTreeCreateFilter,
                        controlTreeCreateTreeContainer,
                        controlTreeSetReferences,
                        controlTreeCreateTree);
                });
            });

            describe('should not call', function () {
                var controlTreeCreateTree;

                beforeEach(function () {
                    controlTreeCreateTree = sinon.spy(controlTree, '_createTree');
                    controlTree._data = undefined;
                    controlTree._createHTML();
                });

                afterEach(function () {
                    controlTree._createTree.restore();
                });

                it('"#_createTree()" if there is no data', function () {
                    controlTreeCreateTree.callCount.should.equal(0);
                });
            });

        });

        describe('#_createFilter()', function () {
            it('should return string', function () {
                var filterHTML = controlTree._createFilter();
                filterHTML.should.be.a('string');
            });
        });

        describe('#_createTreeContainer()', function () {
            it('should return string', function () {
                var treeContainerHTML = controlTree._createTreeContainer();
                treeContainerHTML.should.be.a('string');
            });

            it('should return string with HTML element', function () {
                var treeContainerHTML = controlTree._createTreeContainer();
                var expected = '<tree show-namespaces show-attributes></tree>';

                treeContainerHTML.should.equal(expected);
            });
        });

        describe('#_createTree()', function () {
            var createTree;
            var consoleOutput;

            beforeEach(function () {
                createTree = sinon.spy(controlTree, '_createTreeHTML');
                consoleOutput = sinon.spy(console, 'warn');
            });

            afterEach(function () {
                controlTree._createTreeHTML.restore();
                console.warn.restore();
            });

            it('should call "#_createTreeHTML()" only once', function () {
                controlTree._createTreeHTML();
                createTree.callCount.should.equal(1);
            });

            it('should call "#_createTreeHTML()" with argument equal to ControlTree.getData().controls', function () {
                controlTree._createTreeHTML();
                createTree.calledWith(controlTree.getData().controls);
            });

            it('should returnasdasdas da das das ', function () {
                controlTree._data.versionInfo = '';

                controlTree._createTree();

                consoleOutput.callCount.should.equal(1);
            });

        });

        describe('#_createTreeHTML()', function () {

            it('should return string', function () {
                var treeHTML = controlTree._createTreeHTML();
                treeHTML.should.be.a('string');
            });

            it('should return empty string if no parameters are used', function () {
                var treeHTML = controlTree._createTreeHTML();
                treeHTML.length.should.equal(0);
            });

            it('should return string with HTML elements', function () {
                var treeHTML = controlTree._createTreeHTML(mockControlTreeEdited.controls);
                var expected = '<ul expanded="true"><li id="ShellEdited"><offset style="padding-left:10px" ><place-holder></place-holder></offset><tag data-search="sap.m.ShellShellEdited">&#60;<namespace>sap.m.</namespace>Shell<attribute>&#32;id="<attribute-value>ShellEdited</attribute-value>"</attribute>&#62;</tag></li></ul>';

                treeHTML.should.equal(expected);
            });
        });

        describe('#_toggleCollapse()', function () {
            var arrow;
            var firstParentUl;

            beforeEach(function () {
                arrow = controlTree._controlTreeContainer.querySelector('arrow');
                firstParentUl = controlTree._controlTreeContainer.querySelector('#Shell').nextElementSibling;
                arrow.click();
            });

            it('should change "arrow" attribute to "right"', function () {
                arrow.getAttribute('right').should.ok;
            });

            it('should change "arrow" attribute to "down" on second click', function () {
                arrow.click();
                arrow.getAttribute('down').should.ok;
            });

            it('should not do any changes if the element has no "arrow" attribute', function () {
                var filterContainerAttributesCount = controlTree._filterContainer.attributes.length;

                controlTree._toggleCollapse(controlTree._filterContainer);

                controlTree._filterContainer.attributes.length.should.equal(filterContainerAttributesCount);
            });
        });

        describe('#_selectTreeElement()', function () {
            var listElement;
            var scrollToElement;
            var onSelectionChanged;

            beforeEach(function () {
                scrollToElement = sinon.spy(controlTree, '_scrollToElement');
                onSelectionChanged = sinon.spy(controlTree, 'onSelectionChanged');

                listElement = document.getElementById('app');
            });

            afterEach(function () {
                controlTree._scrollToElement.restore();
                controlTree.onSelectionChanged.restore();
            });

            it('should add "selected" attribute when called from "click"', function () {
                controlTree._selectTreeElement(listElement);
                listElement.getAttribute('selected').should.equal('true');
            });

            it('should not set "selected" attribute if the the given element is the Tree container', function () {
                controlTree._selectTreeElement(controlTree._controlTreeContainer);
                should.equal(controlTree._controlTreeContainer.getAttribute('selected'), null);
            });

            it('should set "selected" attribute to only one element', function () {
                controlTree._selectTreeElement(listElement);
                controlTree._selectTreeElement(document.getElementById('Shell'));

                var selectedElements = controlTree._controlTreeContainer.querySelectorAll('[selected]');
                selectedElements.length.should.equal(1);
            });

            it('should call "#_scrollToElement()" only once', function () {
                controlTree._selectTreeElement(listElement);

                scrollToElement.callCount.should.equal(1);
            });

            it('should call "#onSelectionChanged()" only once', function () {
                listElement = document.getElementById('app');
                controlTree._selectTreeElement(listElement);

                onSelectionChanged.callCount.should.equal(1);
            });
        });

        describe('#_scrollToElement()', function () {
            var treeScrollPosition;

            beforeEach(function () {
                treeScrollPosition = controlTree._treeContainer.scrollTop;

                controlTree._controlTreeContainer.style.height = '500px';
            });

            it('should scroll to element', function () {
                controlTree._scrollToElement(document.getElementById('__item0-__xmlview0--list-35'));

                treeScrollPosition.should.not.equal(controlTree._treeContainer.scrollTop);
            });

            it('should not scroll if the element is visible on the screen', function () {
                controlTree._scrollToElement(document.getElementById('__item0-__xmlview0--list-35'));
                var initialScrollPosition = controlTree._treeContainer.scrollTop;

                controlTree._scrollToElement(document.getElementById('__item0-__xmlview0--list-36'));

                initialScrollPosition.should.equal(controlTree._treeContainer.scrollTop);
            });
        });

        describe('#_searchInTree()', function () {

            it('should add "matching" attribute to element that match the search', function () {
                var listElementFromControlTree = document.getElementById('Shell');
                controlTree._searchInTree('Shell');

                listElementFromControlTree.getAttribute('matching').should.be.ok;
            });

            it('should add "matching" attribute to more than one element that match the search', function () {
                controlTree._searchInTree('splitapp');

                controlTree._treeContainer.querySelectorAll('[matching]').length.should.equal(3);
            });
        });

        describe('#_setSearchResultCount()', function () {

            it('should add the parameter that is call with, inside of the "results" tag in the "filter"', function () {
                controlTree._setSearchResultCount('2');
                var count = controlTree._filterContainer.querySelector('results').innerText;

                count.should.equal('(2)');
            });

        });

        describe('#_removeAttributesFromSearch()', function () {

            it('should remove all "matching" attributes from "#_searchInTree()"', function () {
                controlTree._searchInTree('Split');
                controlTree._removeAttributesFromSearch();

                controlTree._treeContainer.querySelectorAll('[matching]').length.should.equal(0);
            });

        });

        describe('#_onArrowClick()', function () {
            var arrow;
            var namespace;
            var toggleCollapse;
            var selectTreeElement;

            beforeEach(function () {
                arrow = controlTree._controlTreeContainer.querySelector('arrow');
                namespace = controlTree._controlTreeContainer.querySelector('namespace');
                toggleCollapse = sinon.spy(controlTree, '_toggleCollapse');
                selectTreeElement = sinon.spy(controlTree, '_selectTreeElement');
            });

            afterEach(function () {
                controlTree._toggleCollapse.restore();
                controlTree._selectTreeElement.restore();
            });

            it('should call "#_toggleCollapse()" only once, if the "arrow" is clicked', function () {
                arrow.click();
                toggleCollapse.callCount.should.equal(1);
            });

            it('should call "#_selectTreeElement()" only once, if element different from "arrow" is clicked', function () {
                namespace.click();
                selectTreeElement.callCount.should.equal(1);
            });

        });

        describe('#_onSearchInput()', function () {

            describe('should call "#_searchInTree()" ', function () {
                var searchInTree;
                var eventMock = {};

                beforeEach(function () {
                    searchInTree = sinon.spy(controlTree, '_searchInTree');

                    // Mock key event
                    eventMock.target = controlTree._filterContainer.querySelector('[search]');
                    eventMock.target.value = 'shell';

                    controlTree._onSearchInput(eventMock);
                });

                afterEach(function () {
                    controlTree._searchInTree.restore();
                });

                it('only once, if there is a user input in the search field', function () {
                    searchInTree.callCount.should.equal(1);
                });

                it('with the value of the search input', function () {
                    searchInTree.calledWith(eventMock.target.value).should.equal(true);
                });

            });

            describe('should call "#removeAttributesFromSearch()" ', function () {
                var removeAttributesFromSearch;
                var eventMock = {};

                beforeEach(function () {
                    removeAttributesFromSearch = sinon.spy(controlTree, '_removeAttributesFromSearch');

                    // Mock key event
                    eventMock.target = controlTree._filterContainer.querySelector('[search]');
                    eventMock.target.value = '';

                    controlTree._onSearchInput(eventMock);
                });

                afterEach(function () {
                    controlTree._removeAttributesFromSearch.restore();
                });

                it('only once, if there is no user input in the search field', function () {
                    removeAttributesFromSearch.callCount.should.equal(1);
                });

                it('with string parameter = "matching"', function () {
                    removeAttributesFromSearch.calledWith('matching').should.equal(true);
                });

            });

            describe('should call "#_setSearchResultCount()" ', function () {
                var setSearchResultCount;
                var eventMock = {};

                beforeEach(function () {
                    setSearchResultCount = sinon.spy(controlTree, '_setSearchResultCount');

                    // Mock key event
                    eventMock.target = controlTree._filterContainer.querySelector('[search]');
                    eventMock.target.value = '';

                    controlTree._onSearchInput(eventMock);
                });

                afterEach(function () {
                    controlTree._setSearchResultCount.restore();
                });

                it('only once, if there is no user input in the search field', function () {
                    setSearchResultCount.callCount.should.equal(1);
                });

                it('with the count of the elements that match the input', function () {
                    var argument = controlTree._treeContainer.querySelectorAll('[matching]').length;
                    setSearchResultCount.calledWith(argument).should.equal(true);
                });

            });

            describe('should not call any methods if the event is not from the search field', function () {
                var searchInTree;
                var removeAttributesFromSearch;
                var setSearchResultCount;
                var eventMock = {};

                beforeEach(function () {
                    searchInTree = sinon.spy(controlTree, '_searchInTree');
                    removeAttributesFromSearch = sinon.spy(controlTree, '_removeAttributesFromSearch');
                    setSearchResultCount = sinon.spy(controlTree, '_setSearchResultCount');

                    // Mock key event
                    eventMock.target = controlTree._filterContainer;

                    controlTree._onSearchInput(eventMock);
                });

                afterEach(function () {
                    controlTree._searchInTree.restore();
                    controlTree._removeAttributesFromSearch.restore();
                    controlTree._setSearchResultCount.restore();
                });

                it('only once, if there is a user input in the search', function () {
                    searchInTree.callCount.should.equal(0);
                    removeAttributesFromSearch.callCount.should.equal(0);
                    setSearchResultCount.callCount.should.equal(0);
                });

            });
        });

        describe('#_onSearchEvent()', function () {
            describe('should call "#removeAttributesFromSearch()" ', function () {
                var removeAttributesFromSearch;
                var eventMock = {};

                beforeEach(function () {
                    removeAttributesFromSearch = sinon.spy(controlTree, '_removeAttributesFromSearch');

                    // Mock key event
                    eventMock.target = controlTree._filterContainer.querySelector('[search]');
                    eventMock.target.value = '';

                    controlTree._onSearchEvent(eventMock);
                });

                afterEach(function () {
                    controlTree._removeAttributesFromSearch.restore();
                });

                it('only once, if there is no user input in the search field', function () {
                    removeAttributesFromSearch.callCount.should.equal(1);
                });

                it('with string parameter = "matching"', function () {
                    removeAttributesFromSearch.calledWith('matching').should.equal(true);
                });

            });

            describe('should call "#_setSearchResultCount()" ', function () {
                var setSearchResultCount;
                var eventMock = {};

                beforeEach(function () {
                    setSearchResultCount = sinon.spy(controlTree, '_setSearchResultCount');

                    // Mock key event
                    eventMock.target = controlTree._filterContainer.querySelector('[search]');
                    eventMock.target.value = '';

                    controlTree._onSearchEvent(eventMock);
                });

                afterEach(function () {
                    controlTree._setSearchResultCount.restore();
                });

                it('only once, if there is no user input in the search field', function () {
                    setSearchResultCount.callCount.should.equal(1);
                });

                it('with the count of the elements that match the input', function () {
                    var argument = controlTree._treeContainer.querySelectorAll('[matching]').length;
                    setSearchResultCount.calledWith(argument).should.equal(true);
                });

            });

            describe('should not call any methods if ', function () {
                var removeAttributesFromSearch;
                var setSearchResultCount;
                var eventMock = {};

                beforeEach(function () {
                    removeAttributesFromSearch = sinon.spy(controlTree, '_removeAttributesFromSearch');
                    setSearchResultCount = sinon.spy(controlTree, '_setSearchResultCount');

                    // Mock key event
                    eventMock.target = controlTree._filterContainer;
                    eventMock.target.value = 'some input';

                    controlTree._onSearchEvent(eventMock);
                });

                afterEach(function () {
                    controlTree._removeAttributesFromSearch.restore();
                    controlTree._setSearchResultCount.restore();
                });

                it('there is some user input in the search field', function () {
                    removeAttributesFromSearch.callCount.should.equal(0);
                    setSearchResultCount.callCount.should.equal(0);
                });

            });

        });

        describe('#_onOptionsChange()', function () {
            var eventMock;

            it('should remove "show-namespaces" attribute from the tree container', function () {
                controlTree._filterContainer.querySelector('[namespaces]').click();
                should.equal(controlTree._treeContainer.getAttribute('show-namespaces'), null);
            });

            it('should add "show-namespaces" attribute to the tree container', function () {
                controlTree._filterContainer.querySelector('[namespaces]').click();
                controlTree._filterContainer.querySelector('[namespaces]').click();

                controlTree._treeContainer.getAttribute('show-namespaces').should.exist;
            });

            it('should remove "show-attributes" attribute from the tree container', function () {
                controlTree._filterContainer.querySelector('[attributes]').click();
                should.equal(controlTree._treeContainer.getAttribute('show-attributes'), null);
            });

            it('should add "show-attributes" attribute to the tree container', function () {
                controlTree._filterContainer.querySelector('[attributes]').click();
                controlTree._filterContainer.querySelector('[attributes]').click();

                controlTree._treeContainer.getAttribute('show-attributes').should.exist;
            });

            it('should remove "show-filtered-elements" attribute from the tree container', function () {
                controlTree._filterContainer.querySelector('[filter]').click();
                controlTree._filterContainer.querySelector('[filter]').click();

                should.equal(controlTree._treeContainer.getAttribute('show-filtered-elements'), null);
            });

            it('should add "show-filtered-elements" attribute to the tree container', function () {
                controlTree._filterContainer.querySelector('[filter]').click();
                controlTree._treeContainer.getAttribute('show-filtered-elements').should.exist;
            });
        });

        describe('#_onTreeElementMouseHover()', function () {
            var onHoverChanged;
            var eventMock = {};

            beforeEach(function () {
                onHoverChanged = sinon.spy(controlTree, 'onHoverChanged');

                // Mock mouse event
                eventMock.target = controlTree._treeContainer.querySelector('#Shell attribute');

                controlTree._onTreeElementMouseHover(eventMock);
            });

            afterEach(function () {
                controlTree.onHoverChanged.restore();
            });

            it('should call "#onHoverChanged()" only once', function () {
                onHoverChanged.callCount.should.equal(1);
            });

            it('should call "#onHoverChanged()" with the correct UI5 control ID', function () {
                onHoverChanged.calledWith('Shell').should.equal(true);
            });

        });

        describe('#_createHandlers()', function () {
            it('should create onclick handler', function () {
                controlTree._treeContainer.onclick.should.be.a('function');
            });

            it('should create onkeyup handler', function () {
                controlTree._filterContainer.onkeyup.should.be.a('function');
            });

            it('should create onsearch handler', function () {
                controlTree._filterContainer.onsearch.should.be.a('function');
            });

            it('should create onchange handler', function () {
                controlTree._filterContainer.onchange.should.be.a('function');
            });

            it('should create onmouseover handler', function () {
                controlTree._controlTreeContainer.onmouseover.should.be.a('function');
            });

        });

        describe('#_setReferences()', function () {

            it('should create #_filterContainer', function () {
                controlTree._filterContainer.should.not.be.undefined;
            });

            it('should create #_treeContainer', function () {
                controlTree._treeContainer.should.not.be.undefined;
            });

        });

    });

    describe('Options', function () {
        beforeEach(function () {
            controlTree = new ControlTree('control-tree', {
                data: mockControlTree
            });
        });

        it('By default all controls namespaces should be visible', function () {
            controlTree._treeContainer.getAttribute('show-namespaces').should.exist;
        });

        it('By default all controls attributes should be visible', function () {
            controlTree._treeContainer.getAttribute('show-attributes').should.exist;
        });

        it('By default the filter option should be disabled', function () {
            should.equal(controlTree._treeContainer.getAttribute('show-filtered-elements'), null);
        });
    });

    describe('Security - HTML escaping of page-controlled data', function () {
        var xssPayload = 'x"><img src=x onerror="window.__xss=true">';

        beforeEach(function () {
            window.__xss = undefined;
        });

        afterEach(function () {
            delete window.__xss;
        });

        it('should not inject markup from a malicious control id', function () {
            controlTree = new ControlTree('control-tree', {
                data: {
                    versionInfo: {framework: 'OPENUI5', version: '1.0.0'},
                    controls: [{id: xssPayload, name: 'sap.m.Button', type: 'data-sap-ui', content: []}]
                }
            });

            should.equal(controlTree._treeContainer.querySelector('img'), null);
            should.equal(window.__xss, undefined);
        });

        it('should not inject markup from a malicious control name', function () {
            controlTree = new ControlTree('control-tree', {
                data: {
                    versionInfo: {framework: 'OPENUI5', version: '1.0.0'},
                    controls: [{id: 'safeId', name: 'sap.m.' + xssPayload, type: 'data-sap-ui', content: []}]
                }
            });

            should.equal(controlTree._treeContainer.querySelector('img'), null);
            should.equal(window.__xss, undefined);
        });

        it('should not inject markup from a malicious framework/version header', function () {
            controlTree = new ControlTree('control-tree', {
                data: {
                    versionInfo: {framework: xssPayload, version: xssPayload},
                    controls: [{id: 'safeId', name: 'sap.m.Button', type: 'data-sap-ui', content: []}]
                }
            });

            should.equal(controlTree._treeContainer.querySelector('img'), null);
            should.equal(window.__xss, undefined);
        });

        it('should preserve the original (unescaped) id so selection still works', function () {
            controlTree = new ControlTree('control-tree', {
                data: {
                    versionInfo: {framework: 'OPENUI5', version: '1.0.0'},
                    controls: [{id: xssPayload, name: 'sap.m.Button', type: 'data-sap-ui', content: []}]
                }
            });

            var li = controlTree._treeContainer.querySelector('li[id]');
            li.should.not.be.null;
            li.getAttribute('id').should.equal(xssPayload);
        });
    });
});
